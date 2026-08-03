/**
 * Purchase prices are entered in dollars and stored in hryvnia, so every
 * assertion about stored money depends on a rate. Pin it: a live cash quote
 * would make «$35 → 1400 ₴» unassertable and put the provider in the loop of
 * a test run. $1 = 40 ₴ keeps the arithmetic readable.
 */
process.env.EXCHANGE_RATE_USD = '40';
