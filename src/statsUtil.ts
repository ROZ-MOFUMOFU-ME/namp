/**
 * Pure helpers extracted from libs/stats.js.
 *
 * stats.js imports stratum-pool (algoProperties), whose module graph keeps the
 * event loop alive and makes `node --test` hang. Mirroring the
 * priceProviders / profitSwitchLogic / metrics / health split, the pure
 * formatting, sorting and rounding helpers live here so they can be unit-tested
 * in isolation. Behaviour is preserved verbatim from the original stats.js.
 */

/**
 * Sort an object's own enumerable properties into an array of [key, value] pairs.
 * @param obj object whose own properties are sorted.
 * @param sortedBy property of each value to sort by (default 1).
 * @param isNumericSort numeric compare when true, otherwise case-insensitive string compare.
 * @param reverse reverse the sort order.
 * @returns [[key, value], ...] in sorted order.
 */
export function sortProperties(
    obj: Record<string, any>,
    sortedBy?: string | number,
    isNumericSort?: boolean,
    reverse?: boolean
): [string, any][] {
    sortedBy = sortedBy || 1; // by default first key
    isNumericSort = isNumericSort || false; // by default text sort
    reverse = reverse || false; // by default no reverse

    const reversed = reverse ? -1 : 1;

    const sortable: [string, any][] = [];
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            sortable.push([key, obj[key]]);
        }
    }
    if (isNumericSort) {
        sortable.sort(function (a, b) {
            return reversed * (a[1][sortedBy] - b[1][sortedBy]);
        });
    } else {
        sortable.sort(function (a, b) {
            const x = a[1][sortedBy].toLowerCase();
            const y = b[1][sortedBy].toLowerCase();
            return x < y ? reversed * -1 : x > y ? reversed : 0;
        });
    }
    return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}

/**
 * Sort an object's properties and rebuild it as a new object in sorted order.
 */
export function sortObjectByProperty(
    objects: Record<string, any>,
    sortedBy?: string | number,
    isNumericSort?: boolean,
    reverse?: boolean
): Record<string, any> {
    const newObject: Record<string, any> = {};
    const sortedArray = sortProperties(
        objects,
        sortedBy,
        isNumericSort,
        reverse
    );
    for (let i = 0; i < sortedArray.length; i++) {
        newObject[sortedArray[i][0]] = sortedArray[i][1];
    }
    return newObject;
}

/** Round a number to the given number of decimal digits. */
export function roundTo(n: number, digits?: number): number {
    if (digits === undefined) {
        digits = 0;
    }
    const multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    const test = Math.round(n) / multiplicator;
    return +test.toFixed(digits);
}

/** Format a duration in seconds as a compact "Xd Xh Xm Xs" string. */
export function readableSeconds(t: number): string {
    let seconds = Math.round(t);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    hours = hours - days * 24;
    minutes = minutes - days * 24 * 60 - hours * 60;
    seconds = seconds - days * 24 * 60 * 60 - hours * 60 * 60 - minutes * 60;
    if (days > 0) {
        return days + 'd ' + hours + 'h ' + minutes + 'm ' + seconds + 's';
    }
    if (hours > 0) {
        return hours + 'h ' + minutes + 'm ' + seconds + 's';
    }
    if (minutes > 0) {
        return minutes + 'm ' + seconds + 's';
    }
    return seconds + 's';
}

/**
 * Format a hashrate (in MH/s, the portal's internal unit) as a human-readable
 * string. Used for both pool/worker and network hashrates, which historically
 * shared an identical implementation.
 */
/** Comparator that orders Redis block keys ("...:...:height") by height, descending. */
export function sortBlocks(a: string, b: string): number {
    const as = parseInt(a.split(':')[2]);
    const bs = parseInt(b.split(':')[2]);
    if (as > bs) return -1;
    if (as < bs) return 1;
    return 0;
}

/** Comparator that orders workers by ascending hashrate. */
export function sortWorkersByHashrate(
    a: { hashrate: number },
    b: { hashrate: number }
): number {
    if (a.hashrate === b.hashrate) {
        return 0;
    } else {
        return a.hashrate < b.hashrate ? -1 : 1;
    }
}

/**
 * Coin/satoshi conversions bound to a coin's magnitude (satoshis per coin).
 *
 * stats and paymentProcessor both need these, but they source the magnitude
 * differently: stats assumes the usual 1e8, while paymentProcessor derives it
 * at runtime from the daemon's `getbalance` precision and only knows it after
 * that call returns. Passing a getter keeps that late binding intact — the
 * helpers always read the current value — instead of each module carrying its
 * own copy of the arithmetic.
 */
export function createCoinAmounts(magnitude: number | (() => number)) {
    const current =
        typeof magnitude === 'function' ? magnitude : () => magnitude;
    const precision = () => current().toString().length - 1;

    return {
        /** Satoshis to coins, rounded to the coin's precision. */
        satoshisToCoins(satoshis: number): number {
            return roundTo(satoshis / current(), precision());
        },
        /** Coins to whole satoshis. */
        coinsToSatoshies(coins: number): number {
            return Math.round(coins * current());
        },
        /** Round a coin amount to the coin's precision. */
        coinsRound(amount: number): number {
            return roundTo(amount, precision());
        }
    };
}

/**
 * Hashrate formatting lives in stratum-pool so the library's startup banner and
 * the website render identical strings; re-exported here under the portal's
 * historical name.
 */
export { getReadableHashRateString as readableHashRateString } from './stratum/util.ts';
