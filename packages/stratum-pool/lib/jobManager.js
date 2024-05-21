var events = require('events');
var crypto = require('crypto');

var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');

//Unique extranonce per subscriber
var ExtraNonceCounter = function (configInstanceId) {

    var instanceId = configInstanceId || crypto.randomBytes(4).readUInt32LE(0);
    var counter = instanceId << 27;

    this.next = function () {
        var extraNonce = util.packUInt32BE(Math.abs(counter++));
        return extraNonce.toString('hex');
    };

    this.size = 4; //bytes
};

//Unique job per new block template
var JobCounter = function () {
    var counter = 0;

    this.next = function () {
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    this.cur = function () {
        return counter.toString(16);
    };
};

var JobManager = module.exports = function JobManager(options) {

    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    function CheckNewIfHigher(height) {
        if (height > currentJob.rpcData.height) {
            GetBlockTemplate(function (error, result) {
                if (error)
                    emitErrorLog('CheckNewIfHigher ' + height + ' error: ' + error);
            });
        }
    }

    function GetBlockTemplate(callback) {

        _this.daemon.cmd('getblocktemplate',
            [{ "capabilities": ["coinbasetxn", "workid", "coinbase/append"], "rules": ["segwit"] }],
            function (result) {
                if (result.error) {
                    emitErrorLog('getblocktemplate call failed for daemon instance ' +
                        result.instance.index + ' with error ' + JSON.stringify(result.error));
                    callback(result.error);
                } else {
                    var processedNewBlock = _this.jobManager.processTemplate(result.response);
                    callback(null, result.response, processedNewBlock);
                    callback = function () { };
                }
            }, true
        );
    }

    function ProcessBlockTemplate(template) {

        if (currentJob) {
            var height = template.height - currentJob.rpcData.height;
            if (height > 0) {
                if (height > 1) {
                    emitLog('Skipping ' + (height - 1) + ' block(s) due to daemon error or non-matching block template');
                }
            }
        }

        var tmpBlockTemplate = new blockTemplate(template);

        var newJob = {
            id: jobCounter.next(),
            height: tmpBlockTemplate.height,
            difficulty: tmpBlockTemplate.difficulty,
            submissions: []
        };

        newJob.rpcData = tmpBlockTemplate;
        currentJob = newJob;

        _this.emit('newBlock', newJob);

        return true;
    }

    this.processTemplate = function (template) {
        return ProcessBlockTemplate(template);
    };

    this.processShare = function (jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName) {

        var shareError = function (error) {
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                worker: workerName,
                difficulty: difficulty,
                error: error[1]
            });
            return { error: error, result: null };
        };

        var submitTime = Date.now() / 1000 | 0;

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extranonce2']);

        var job = _this.validJobs[jobId];
            if (typeof job === 'undefined' || job.jobId != jobId) {
                return shareError([21, 'job not found']);
            }
            if (nTime.length !== 8) {
                return shareError([20, 'incorrect size of ntime']);
            }
            var nTimeInt = parseInt(nTime, 16);
            if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
                return shareError([20, 'ntime out of range']);
            }
            if (nonce.length !== 8) {
                return shareError([20, 'incorrect size of nonce']);
            }
            if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
                return shareError([22, 'duplicate share']);
            }
    
            var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
            var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');
    
            var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
            var coinbaseHash = coinbaseHasher(coinbaseBuffer);
    
            var merkleRoot = util.reverseBuffer(job.merkleTree.withFirst(coinbaseHash)).toString('hex');
    
            var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce);
            var headerHash = hashDigest(headerBuffer, nTimeInt);
            var headerBigNum = util.bignumFromBuffer(headerHash);
    
            var blockHashInvalid;
            var blockHash;
            var blockHex;
    
            var shareDiff = diff1 / headerBigNum * shareMultiplier;
    
            var blockDiffAdjusted = job.difficulty * shareMultiplier;
    
            //Check if share is a block candidate (matched network difficulty)
            if (job.target.ge(headerBigNum)) {
                blockHex = job.serializeBlock(headerBuffer, coinbaseBuffer).toString('hex');
                blockHash = util.reverseBuffer(util.sha256d(headerBuffer)).toString('hex');
            }
            else {
                if (options.emitInvalidBlockHashes)
                    blockHashInvalid = util.reverseBuffer(util.sha256d(headerBuffer)).toString('hex');
    
                //Check if share didn't reached the miner's difficulty)
                if (shareDiff / difficulty < 0.99) {
    
                    //Check if share matched a previous difficulty from before a vardiff retarget
                    if (previousDifficulty && shareDiff >= previousDifficulty) {
                        difficulty = previousDifficulty;
                    }
                    else {
                        return shareError([23, 'low difficulty share of ' + shareDiff]);
                    }
    
                }
            }
    
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                port: port,
                worker: workerName,
                height: job.rpcData.height,
                blockReward: job.rpcData.coinbasevalue,
                difficulty: difficulty,
                shareDiff: shareDiff.toFixed(8),
                blockDiff: blockDiffAdjusted,
                blockDiffActual: job.difficulty,
                blockHash: blockHash,
                blockHashInvalid: blockHashInvalid
            }, blockHex);
    
            return { result: true, error: null, blockHash: blockHash };
        };
    };
    JobManager.prototype.__proto__ = events.EventEmitter.prototype;
    