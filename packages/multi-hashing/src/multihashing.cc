#include <node.h>
#include <node_buffer.h>
#include <v8.h>
#include <stdint.h>
#include <nan.h>

extern "C"
{
#include "allium.h"
#include "bcrypt.h"
#include "blake.h"
#include "blake2s.h"
#include "c11.h"
#include "cryptonight.h"
#include "cryptonight_fast.h"
#include "fresh.h"
#include "fugue.h"
#include "gost.h"
#include "groestl.h"
#include "hefty1.h"
#include "hsr14.h"
#include "keccak.h"
#include "lbry.h"
#include "crypto/lyra2.h"
#include "lyra2re.h"
#include "lyra2z.h"
#include "lyra2z16m330.h"
#include "lyra2z330.h"
#include "m7.h"
#include "minotaur.h"
#include "neoscrypt.h"
#include "nist5.h"
#include "phi1612.h"
#include "quark.h"
#include "qubit.h"
#include "scryptjane.h"
#include "scryptn.h"
#include "sha1.h"
#include "sha256.h"
#include "sha256d.h"
#include "shavite3.h"
#include "skein.h"
#include "skunk.h"
#include "skydoge.h"
#include "tribus.h"
#include "sponge.h"
#include "vipstar.h"
#include "whirlpoolx.h"
#include "x11.h"
#include "x13.h"
#include "x15.h"
#include "x16r.h"
#include "x16rv2.h"
#include "x17.h"
#include "x25x.h"
#include "xevan.h"
#include "zr5.h"
#include "argon2/argon2.h"
#include "yespower/yespower.h"
}

#include "kawpow.hpp"
#include "boolberry.h"
#include "odo.h"

using namespace node;
using namespace Nan;
using namespace v8;

#define SET_BUFFER_RETURN(x, len) \
    info.GetReturnValue().Set(Nan::CopyBuffer(x, len).ToLocalChecked());

#define SET_BOOLEAN_RETURN(x) \
    info.GetReturnValue().Set(Nan::To<Boolean>(x).ToChecked());

#define RETURN_EXCEPT(msg) \
    return Nan::ThrowError(msg)

#define DECLARE_FUNC(x) \
    NAN_METHOD(x)

#define DECLARE_CALLBACK(name, hash, output_len)                          \
    DECLARE_FUNC(name)                                                    \
    {                                                                     \
                                                                          \
        if (info.Length() < 1)                                            \
            RETURN_EXCEPT("You must provide one argument.");              \
                                                                          \
        Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked(); \
                                                                          \
        if (!Buffer::HasInstance(target))                                 \
            RETURN_EXCEPT("Argument should be a buffer object.");         \
                                                                          \
        char *input = Buffer::Data(target);                               \
        char output[32];                                                  \
                                                                          \
        uint32_t input_len = Buffer::Length(target);                      \
                                                                          \
        hash(input, output, input_len);                                   \
                                                                          \
        SET_BUFFER_RETURN(output, output_len);                            \
    }

DECLARE_CALLBACK(allium, allium_hash, 32);
DECLARE_CALLBACK(bcrypt, bcrypt_hash, 32);
DECLARE_CALLBACK(blake, blake_hash, 32);
DECLARE_CALLBACK(blake2s, blake2s_hash, 32);
DECLARE_CALLBACK(c11, c11_hash, 32);
DECLARE_CALLBACK(fresh, fresh_hash, 32);
DECLARE_CALLBACK(fugue, fugue_hash, 32);
DECLARE_CALLBACK(gost, gost_hash, 32);
DECLARE_CALLBACK(groestl, groestl_hash, 32);
DECLARE_CALLBACK(groestlmyriad, groestlmyriad_hash, 32);
DECLARE_CALLBACK(hefty1, hefty1_hash, 32);
DECLARE_CALLBACK(hsr, hsr_hash, 32);
DECLARE_CALLBACK(keccak, keccak_hash, 32);
DECLARE_CALLBACK(lbry, lbry_hash, 32);
DECLARE_CALLBACK(lyra2re, lyra2re_hash, 32);
DECLARE_CALLBACK(lyra2re2, lyra2re_hash, 32);
DECLARE_CALLBACK(lyra2rev2, lyra2rev2_hash, 32);
DECLARE_CALLBACK(lyra2rev3, lyra2rev3_hash, 32);
DECLARE_CALLBACK(lyra2z, lyra2z_hash, 32);
DECLARE_CALLBACK(lyra2z16m330, lyra2z16m330_hash, 32);
DECLARE_CALLBACK(lyra2z330, lyra2z330_hash, 32);
DECLARE_CALLBACK(m7, m7_hash, 32);
DECLARE_CALLBACK(m7m, m7m_hash, 32);
DECLARE_CALLBACK(minotaur, minotaur_hash, 32);
DECLARE_CALLBACK(nist5, nist5_hash, 32);
DECLARE_CALLBACK(phi1612, phi1612_hash, 32);
DECLARE_CALLBACK(quark, quark_hash, 32);
DECLARE_CALLBACK(qubit, qubit_hash, 32);
DECLARE_CALLBACK(sha1, sha1_hash, 32);
DECLARE_CALLBACK(sha256d, sha256d_hash, 32);
DECLARE_CALLBACK(shavite3, shavite3_hash, 32);
DECLARE_CALLBACK(skein, skein_hash, 32);
DECLARE_CALLBACK(skunk, skunk_hash, 32);
DECLARE_CALLBACK(skydoge, skydoge_hash, 32);
DECLARE_CALLBACK(tribus, tribus_hash, 32);
DECLARE_CALLBACK(whirlpoolx, whirlpoolx_hash, 32);
DECLARE_CALLBACK(x11, x11_hash, 32);
DECLARE_CALLBACK(x13, x13_hash, 32);
DECLARE_CALLBACK(x15, x15_hash, 32);
DECLARE_CALLBACK(x16r, x16r_hash, 32);
DECLARE_CALLBACK(x16rv2, x16rv2_hash, 32);
DECLARE_CALLBACK(x17, x17_hash, 32);
DECLARE_CALLBACK(x25x, x25x_hash, 32);
DECLARE_CALLBACK(xevan, xevan_hash, 32);
DECLARE_CALLBACK(zr5, zr5_hash, 32);
DECLARE_CALLBACK(yespower, yespower_hash, 32);
DECLARE_CALLBACK(yespower_0_5_R8, yespower_0_5_R8_hash, 32);
DECLARE_CALLBACK(yespower_0_5_R16, yespower_0_5_R16_hash, 32);
DECLARE_CALLBACK(yespower_0_5_R24, yespower_0_5_R24_hash, 32);
DECLARE_CALLBACK(yespower_0_5_R32, yespower_0_5_R32_hash, 32);
DECLARE_CALLBACK(yespower_arwn, yespower_arwn_hash, 32);
DECLARE_CALLBACK(yespower_ic, yespower_ic_hash, 32);
DECLARE_CALLBACK(yespower_iots, yespower_iots_hash, 32);
DECLARE_CALLBACK(yespower_litb, yespower_litb_hash, 32);
DECLARE_CALLBACK(yespower_ltncg, yespower_ltncg_hash, 32);
DECLARE_CALLBACK(yespower_mgpc, yespower_mgpc_hash, 32);
DECLARE_CALLBACK(yespower_r16, yespower_r16_hash, 32);
DECLARE_CALLBACK(yespower_sugar, yespower_sugar_hash, 32);
DECLARE_CALLBACK(yespower_tide, yespower_tide_hash, 32);
DECLARE_CALLBACK(yespower_urx, yespower_urx_hash, 32);

DECLARE_FUNC(argon2d)
{
    if (info.Length() < 4)
        RETURN_EXCEPT("You must provide buffer to hash, T value, M value, and P value");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int tValue = Nan::To<uint32_t>(info[1]).ToChecked();
    unsigned int mValue = Nan::To<uint32_t>(info[2]).ToChecked();
    unsigned int pValue = Nan::To<uint32_t>(info[3]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    argon2d_hash_raw(tValue, mValue, pValue, input, input_len, input, input_len, output, 32);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(argon2i)
{
    if (info.Length() < 4)
        RETURN_EXCEPT("You must provide buffer to hash, T value, M value, and P value");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int tValue = Nan::To<uint32_t>(info[1]).ToChecked();
    unsigned int mValue = Nan::To<uint32_t>(info[2]).ToChecked();
    unsigned int pValue = Nan::To<uint32_t>(info[3]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    argon2i_hash_raw(tValue, mValue, pValue, input, input_len, input, input_len, output, 32);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(argon2id)
{

    if (info.Length() < 4)
        RETURN_EXCEPT("You must provide buffer to hash, T value, M value, and P value");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int tValue = Nan::To<uint32_t>(info[1]).ToChecked();
    unsigned int mValue = Nan::To<uint32_t>(info[2]).ToChecked();
    unsigned int pValue = Nan::To<uint32_t>(info[3]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    argon2id_hash_raw(tValue, mValue, pValue, input, input_len, input, input_len, output, 32);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(scrypt)
{
    if (info.Length() < 3)
        RETURN_EXCEPT("You must provide buffer to hash, N value, and R value");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int nValue = Nan::To<uint32_t>(info[1]).ToChecked();
    unsigned int rValue = Nan::To<uint32_t>(info[2]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    scrypt_N_R_1_256(input, output, nValue, rValue, input_len);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(neoscrypt)
{
    if (info.Length() < 2)
        RETURN_EXCEPT("You must provide two arguments");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    uint32_t profile = Nan::To<uint32_t>(info[1]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    if (input_len < 80)
        RETURN_EXCEPT("Argument must be longer than 80 bytes");
    neoscrypt(input, output, profile);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(scryptn)
{
    if (info.Length() < 2)
        RETURN_EXCEPT("You must provide buffer to hash and N factor.");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int nFactor = Nan::To<uint32_t>(info[1]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    // unsigned int N = 1 << (getNfactor(input) + 1);
    unsigned int N = 1 << nFactor;

    scrypt_N_R_1_256(input, output, N, 1, input_len); // hardcode for now to R=1 for now

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(scryptjane)
{
    if (info.Length() < 5)
        RETURN_EXCEPT("You must provide two argument: buffer, timestamp as number, and nChainStarTime as number, nMin, and nMax");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("First should be a buffer object.");

    int timestamp = Nan::To<int32_t>(info[1]).ToChecked();
    int nChainStartTime = Nan::To<int32_t>(info[2]).ToChecked();
    int nMin = Nan::To<int32_t>(info[3]).ToChecked();
    int nMax = Nan::To<int32_t>(info[4]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    scryptjane_hash(input, input_len, (uint32_t *)output, GetNfactorJane(timestamp, nChainStartTime, nMin, nMax));

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(cryptonight)
{
    bool fast = false;
    uint32_t cn_variant = 0;
    uint64_t height = 0;

    if (info.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    if (info.Length() >= 2)
    {
        if (info[1]->IsBoolean())
            fast = Nan::To<bool>(info[1]).ToChecked();
        else if (info[1]->IsUint32())
            cn_variant = Nan::To<uint32_t>(info[1]).ToChecked();
        else
            RETURN_EXCEPT("Argument 2 should be a boolean or uint32_t");
    }

    if ((cn_variant == 4) && (info.Length() < 3))
    {
        RETURN_EXCEPT("You must provide Argument 3 (block height) for Cryptonight variant 4");
    }

    if (info.Length() >= 3)
    {
        if (info[2]->IsUint32())
            height = Nan::To<uint32_t>(info[2]).ToChecked();
        else
            RETURN_EXCEPT("Argument 3 should be uint32_t");
    }

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    if (fast)
        cryptonight_fast_hash(input, output, input_len);
    else
    {
        if ((cn_variant == 1) && input_len < 43)
            RETURN_EXCEPT("Argument must be 43 bytes for monero variant 1");
        cryptonight_hash(input, output, input_len, cn_variant, height);
    }
    SET_BUFFER_RETURN(output, 32);
}
DECLARE_FUNC(cryptonightfast)
{
    bool fast = false;
    uint32_t cn_variant = 0;

    if (info.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    if (info.Length() >= 2)
    {
        if (info[1]->IsBoolean())
            fast = Nan::To<bool>(info[1]).ToChecked();
        else if (info[1]->IsUint32())
            cn_variant = Nan::To<uint32_t>(info[1]).ToChecked();
        else
            RETURN_EXCEPT("Argument 2 should be a boolean or uint32_t");
    }

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    if (fast)
        cryptonightfast_fast_hash(input, output, input_len);
    else
    {
        if (cn_variant > 0 && input_len < 43)
            RETURN_EXCEPT("Argument must be 43 bytes for monero variant 1+");
        cryptonightfast_hash(input, output, input_len, cn_variant);
    }
    SET_BUFFER_RETURN(output, 32);
}
DECLARE_FUNC(boolberry)
{
    if (info.Length() < 2)
        RETURN_EXCEPT("You must provide two arguments.");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();
    Local<Object> target_spad = Nan::To<Object>(info[1]).ToLocalChecked();
    uint32_t height = 1;

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument 1 should be a buffer object.");

    if (!Buffer::HasInstance(target_spad))
        RETURN_EXCEPT("Argument 2 should be a buffer object.");

    if (info.Length() >= 3)
    {
        if (info[2]->IsUint32())
            height = Nan::To<uint32_t>(info[2]).ToChecked();
        else
            RETURN_EXCEPT("Argument 3 should be an unsigned integer.");
    }

    char *input = Buffer::Data(target);
    char *scratchpad = Buffer::Data(target_spad);
    char output[32];

    uint32_t input_len = Buffer::Length(target);
    uint64_t spad_len = Buffer::Length(target_spad);

    boolberry_hash(input, input_len, scratchpad, spad_len, output, height);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(odo)
{
    if (info.Length() < 2)
        RETURN_EXCEPT("You must provide buffer to hash and key value");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    unsigned int keyValue = Nan::To<uint32_t>(info[1]).ToChecked();

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    odo_hash(input, output, input_len, keyValue);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(yespower_0_5_R8G)
{
    if (info.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    char *input = Buffer::Data(target);
    char output[32];

    uint32_t input_len = Buffer::Length(target);

    yespower_0_5_R8G_hash(input, input_len, output);

    SET_BUFFER_RETURN(output, 32);
}

DECLARE_FUNC(kawpow)
{
    if (info.Length() < 3)
        RETURN_EXCEPT("You must provide 3 arguments.");
    Local<Object> obj1 = Nan::To<Object>(info[0]).ToLocalChecked();
    Local<Object> obj2 = Nan::To<Object>(info[1]).ToLocalChecked();
    uint32_t height = 1;
    if (!Buffer::HasInstance(obj1))
        RETURN_EXCEPT("Argument 1 (header hash) should be a buffer object.");
    uint32_t obj1_len = Buffer::Length(obj1);
    if (obj1_len != 32)
        RETURN_EXCEPT("The header hash should be 32 bytes.");
    if (!Buffer::HasInstance(obj2))
        RETURN_EXCEPT("Argument 2 (nonce) should be a buffer object.");
    uint32_t obj2_len = Buffer::Length(obj2);
    if (obj2_len != 8)
        RETURN_EXCEPT("The nonce should be 8 bytes.");
    if (info[2]->IsUint32())
        height = Nan::To<uint32_t>(info[2]).ToChecked();
    else
        RETURN_EXCEPT("Argument 3 (height) should be an unsigned integer.");

    uint64_t nonce = 0;

    char *nonce_data = Buffer::Data(obj2);

    std::memcpy((uint8_t *)&nonce, nonce_data, 8);

    uint8_t *header_hash = (uint8_t *)Buffer::Data(obj1);
    ethash::hash256 hash = {};
    for (int i = 0; i < 32; i++)
    {
        hash.bytes[i] = header_hash[i];
    }

    char output[64];

    auto context = ethash::create_epoch_context(ethash::get_epoch_number(height));
    const auto result = progpow::k_hash(*context, height, hash, nonce);

    std::memcpy(output, result.final_hash.bytes, 32);
    std::memcpy(&output[32], result.mix_hash.bytes, 32);

    SET_BUFFER_RETURN(output, 64);
}

DECLARE_FUNC(vipstar)
{
    if (info.Length() < 1)
        RETURN_EXCEPT("You must provide one argument.");

    Local<Object> target = Nan::To<Object>(info[0]).ToLocalChecked();

    if (!Buffer::HasInstance(target))
        RETURN_EXCEPT("Argument should be a buffer object.");

    uint32_t input[32];
    uint32_t output[32];

    std::memcpy(input, Buffer::Data(target), sizeof(input));

    vipstar_hash(output, input);

    SET_BUFFER_RETURN(reinterpret_cast<char*>(output), sizeof(output));
}

NAN_MODULE_INIT(init)
{
    NAN_EXPORT(target, allium);
    NAN_EXPORT(target, argon2d);
    NAN_EXPORT(target, argon2i);
    NAN_EXPORT(target, argon2id);
    NAN_EXPORT(target, bcrypt);
    NAN_EXPORT(target, blake);
    NAN_EXPORT(target, blake2s);
    NAN_EXPORT(target, boolberry);
    NAN_EXPORT(target, kawpow);
    NAN_EXPORT(target, c11);
    NAN_EXPORT(target, cryptonight);
    NAN_EXPORT(target, cryptonightfast);
    NAN_EXPORT(target, fresh);
    NAN_EXPORT(target, fugue);
    NAN_EXPORT(target, gost);
    NAN_EXPORT(target, groestl);
    NAN_EXPORT(target, groestlmyriad);
    NAN_EXPORT(target, hefty1);
    NAN_EXPORT(target, hsr);
    NAN_EXPORT(target, keccak);
    NAN_EXPORT(target, lbry);
    NAN_EXPORT(target, lyra2re);
    NAN_EXPORT(target, lyra2re2);
    NAN_EXPORT(target, lyra2rev2);
    NAN_EXPORT(target, lyra2rev3);
    NAN_EXPORT(target, lyra2z);
    NAN_EXPORT(target, lyra2z16m330);
    NAN_EXPORT(target, lyra2z330);
    NAN_EXPORT(target, m7);
    NAN_EXPORT(target, m7m);
    NAN_EXPORT(target, minotaur);
    NAN_EXPORT(target, neoscrypt);
    NAN_EXPORT(target, nist5);
    NAN_EXPORT(target, odo);
    NAN_EXPORT(target, phi1612);
    NAN_EXPORT(target, quark);
    NAN_EXPORT(target, qubit);
    NAN_EXPORT(target, scrypt);
    NAN_EXPORT(target, scryptjane);
    NAN_EXPORT(target, scryptn);
    NAN_EXPORT(target, sha1);
    NAN_EXPORT(target, sha256d);
    NAN_EXPORT(target, shavite3);
    NAN_EXPORT(target, skein);
    NAN_EXPORT(target, skunk);
    NAN_EXPORT(target, skydoge);
    NAN_EXPORT(target, tribus);
    NAN_EXPORT(target, vipstar);
    NAN_EXPORT(target, whirlpoolx);
    NAN_EXPORT(target, x11);
    NAN_EXPORT(target, x13);
    NAN_EXPORT(target, x15);
    NAN_EXPORT(target, x16r);
    NAN_EXPORT(target, x16rv2);
    NAN_EXPORT(target, x17);
    NAN_EXPORT(target, x25x);
    NAN_EXPORT(target, xevan);
    NAN_EXPORT(target, zr5);
    NAN_EXPORT(target, yespower);
    NAN_EXPORT(target, yespower_0_5_R8);
    NAN_EXPORT(target, yespower_0_5_R8G);
    NAN_EXPORT(target, yespower_0_5_R16);
    NAN_EXPORT(target, yespower_0_5_R24);
    NAN_EXPORT(target, yespower_0_5_R32);
    NAN_EXPORT(target, yespower_arwn);
    NAN_EXPORT(target, yespower_ic);
    NAN_EXPORT(target, yespower_iots);
    NAN_EXPORT(target, yespower_litb);
    NAN_EXPORT(target, yespower_ltncg);
    NAN_EXPORT(target, yespower_mgpc);
    NAN_EXPORT(target, yespower_r16);
    NAN_EXPORT(target, yespower_sugar);
    NAN_EXPORT(target, yespower_tide);
    NAN_EXPORT(target, yespower_urx);
}

NAN_MODULE_WORKER_ENABLED(multihashing, init);
