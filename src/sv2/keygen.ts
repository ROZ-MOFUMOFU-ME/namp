/*
 * npm run sv2:keygen — prints a fresh Stratum V2 authority key pair. Put
 * the secret into pool_configs/<coin>.json under sv2.authoritySecretKey and
 * hand the public key to miners (stratum2+tcp://host:port/<public key>).
 */
import {
    encodePublicKey,
    encodeSecretKey,
    generateAuthorityKeyPair
} from './keys.ts';

const pair = generateAuthorityKeyPair();
console.log(
    `authority public key (give to miners): ${encodePublicKey(pair.publicKey)}`
);
console.log(
    `authority secret key (sv2.authoritySecretKey): ${encodeSecretKey(pair.secretKey)}`
);
