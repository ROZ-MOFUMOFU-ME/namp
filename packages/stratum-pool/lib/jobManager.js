var events = require('events');
var crypto = require('crypto');

var bignum = require('bignum');



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

/**
 * Emits:
 * - newBlock(blockTemplate) - When a new block (previously unknown to the JobManager) is added, use this event to broadcast new jobs
 * - share(shareData, blockHex) - When a worker submits a share. It will have blockHex if a block was found
**/
var JobManager = module.exports = function JobManager(options) {


    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    var shareMultiplier = algos[options.coin.algorithm].multiplier;
    var emitLog = function (text) { _this.emit('log', 'debug', text); };
    var emitErrorLog = function (text) { _this.emit('log', 'error', text); };

    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId);
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size = this.extraNoncePlaceholder.length - this.extraNonceCounter.size;
    this.currentJob;
    this.validJobs = {};

    var hashDigest = algos[options.coin.algorithm].hash(options.coin);

    var coinbaseHasher = (function () {
        switch (options.coin.algorithm) {
            case 'keccak':
            case 'blake':
            case 'fugue':
            case 'groestl':
                if (options.coin.normalHashing === true)
                    return util.sha256d;
                else
                    return util.sha256;
            default:
                return util.sha256d;
        }
    })();


    var blockHasher = (function () {
        switch (options.coin.algorithm) {
            case 'scrypt':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-og':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-jane':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-n':
            case 'sha1':
            case 'yespowerSUGAR':
            case 'yescryptR8G':
            case 'lyra2re2':
            case 'yespowerLTNCG':
            case 'yescryptR16':
            default:
                return function () {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
        }
    })();

    var getKotoFoundersReward = function (rpcData, recipients) {
        if (!options.coin.kotoFoundersReward) {
            return recipients;
        }

        var founders = []
        for (var i = 0; i < options.coin.kotoFoundersReward.length; i++) {
            var founder = options.coin.kotoFoundersReward[i];
            if (rpcData.height >= founder.start && rpcData.height <= founder.last) {
                try {
                    founders.push({
                        percent: 0,
                        value: rpcData.coinbasetxn.foundersreward,
                        script: util.getKotoFounderRewardScript(founder.address)
                    });
                } catch (e) {
                    emitErrorLog('Error generating transaction output script for ' + founder.address + ' in rewardRecipients');
                }
            }
        }

        return founders.concat(recipients);
    }


    this.updateCurrentJob = function (rpcData) {

        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages
        );
        if (options.coin.name === koto || options.coin.name === koto_testnet) {
            tmpBlockTemplate.push(
                getKotoFoundersReward(rpcData, options.recipients),
                options.network
            );
        } else {
            tmpBlockTemplate.push(
                options.recipients,
                options.network
            );
        }

        _this.currentJob = tmpBlockTemplate;

        _this.emit('updatedBlock', tmpBlockTemplate, true);

        _this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

    };

    //returns true if processed a new block
    this.processTemplate = function (rpcData) {

        /* Block is new if A) its the first block we have seen so far or B) the blockhash is different and the
           block height is greater than the one we have */
        var isNewBlock = typeof (_this.currentJob) === 'undefined';
        if (!isNewBlock && _this.currentJob.rpcData.previousblockhash !== rpcData.previousblockhash) {
            isNewBlock = true;

            //If new block is outdated/out-of-sync than return
            if (rpcData.height < _this.currentJob.rpcData.height)
                return false;
        }

        if (!isNewBlock) return false;


        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
        );
        if (options.coin.name === koto || options.coin.name === koto_testnet) {
            tmpBlockTemplate.push(getKotoFoundersReward(rpcData, options.recipients), options.network);
        } else {
            tmpBlockTemplate.push(options.recipients, options.network);
        }
        this.currentJob = tmpBlockTemplate;

        this.validJobs = {};
        _this.emit('newBlock', tmpBlockTemplate);

        this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

        return true;

    };

    this.processShare = function (jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName, versionMask) {
        emitLog('Trying to process share in jobmanager');
        var shareError = function (error) {
            emitLog('shareError, error = %s', JSON.stringify(error));
            
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

        emitLog("extraNonce2.length / 2 !== _this.extraNonce2Size")
        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extranonce2']);

        var job = this.validJobs[jobId];
        emitLog("typeof job === 'undefined' || job.jobId != jobId")
        if (typeof job === 'undefined' || job.jobId != jobId) {
            return shareError([21, 'job not found']);
        }
        emitLog("nTime.length !== 8")
        if (nTime.length !== 8) {
            return shareError([20, 'incorrect size of ntime']);
        }
        emitLog("nTime, 16");
        var nTimeInt = parseInt(nTime, 16);
        if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
            return shareError([20, 'ntime out of range']);
        }
        emitLog("nonce.length !== 8");
        if (nonce.length !== 8) {
            return shareError([20, 'incorrect size of nonce']);
        }
        emitLog("!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)");
        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }


        var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        emitLog("extraNonce1Buffer = %s", extraNonce1.toString("hex"));
        var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');
        emitLog("extraNonce2Buffer = %s", extraNonce2Buffer.toString("hex"));

        var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        emitLog("coinbaseBuffer = %s", coinbaseBuffer.toString("hex"));
        var coinbaseHash = coinbaseHasher(coinbaseBuffer);
        emitLog("coinbaseHash = %s", coinbaseHash.toString("hex"));

        var merkleRoot = util.reverseBuffer(job.merkleTree.withFirst(coinbaseHash)).toString('hex');
        emitLog("merkleRoot = %s", merkleRoot.toString("hex"));

        var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce, versionMask);
        emitLog("headerBuffer = %s", headerBuffer.toString("hex"));
        var headerHash = hashDigest(headerBuffer, nTimeInt);
        emitLog("headerHash = %s", headerHash.toString("hex"));
        var headerBigNum = bignum.fromBuffer(headerHash, { endian: 'little', size: 32 });
        emitLog("headerBigNum = %s", headerBigNum.toString(16));

        var blockHashInvalid;
        var blockHash;
        var blockHex;

        var shareDiff = diff1 / headerBigNum.toNumber() * shareMultiplier;
        emitLog("shareDiff = %s", shareDiff);

        var blockDiffAdjusted = job.difficulty * shareMultiplier;
        emitLog("blockDiffAdjusted = %s", blockDiffAdjusted);

        blockHexInvalid = job.serializeBlock(headerBuffer, coinbaseBuffer).toString('hex');
        emitLog("blockHexInvalid = %s", blockHexInvalid.toString("hex"));

        blockHashInvalid = blockHasher(headerBuffer, nTime).toString('hex');
        emitLog("blockHashInvalid = %s", blockHashInvalid.toString("hex"));

        //Check if share is a block candidate (matched network difficulty)
        emitLog("Checking share against network difficulty");
        if (job.target.ge(headerBigNum)) {
            emitLog("This share is a block candidate");
            blockHex = job.serializeBlock(headerBuffer, coinbaseBuffer).toString('hex');
            emitLog("blockHex = %", blockHex);
            blockHash = blockHasher(headerBuffer, nTime).toString('hex');
            emitLog("blockHash = %", blockHash);
        }
        else {
            emitLog("Share is lower than network diff");
            if (options.emitInvalidBlockHashes)
                emitLog("emitInvalidBlockHashes is true");
                emitLog("blockHashInvalid = %s", blockHashInvalid);
                blockHashInvalid = util.reverseBuffer(util.sha256d(headerBuffer)).toString('hex');

            //Check if share didn't reached the miner's difficulty)
            emitLog("Checking if share matched miner's diff");
            if (shareDiff / difficulty < 0.99) {
                emitLog("Share reached miner's diff");

                //Check if share matched a previous difficulty from before a vardiff retarget
                if (previousDifficulty && shareDiff >= previousDifficulty) {
                    emitLog("Share matched previous diff before retarget");
                    difficulty = previousDifficulty;
                }
                else {
                    logger.error("Too low diffculty of share");
                    return shareError([23, 'low difficulty share of ' + shareDiff]);
                }
            } else {
                emitLog("Sadly, it didnt reach miner diff");

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

        let shareDataToLogger = {
            shareData: {
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
                coinbaseBuffer,
                txHash: coinbaseHash.toString('hex'),
                headerHash,
                coinbaseBuffer,
                blockHash,
                blockHashInvalid,
                time: submitTime
            },
            blockHexInvalid: blockHexInvalid,
            blockHex: blockHex
        };


        emitLog('Emmitted share, shareDataToLogger = %s', JSON.stringify(shareDataToLogger));

        emitLog('Returning result = %s', JSON.stringify({ result: true, error: null, blockHash: blockHash }));
        return { result: true, error: null, blockHash: blockHash };
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
