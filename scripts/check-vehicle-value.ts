// Optional live smoke test: npm exec tsx scripts/check-vehicle-value.ts
// Loads server credentials locally and prints only the estimate summary, never provider URLs/keys.
import fs from 'node:fs';
import { lookupVehicleValue } from '../server/lookups/vinaudit.js';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
try {
    const result = await lookupVehicleValue(process.argv.includes('--vin')
        ? { vin: '2T1BURHE3EC020936', mileage: 60000 }
        : { year: 2020, make: 'Toyota', model: 'Camry', mileage: 60000 });
    console.log(JSON.stringify({ provider: result.providerLabel, vehicle: result.vehicle, mileage: result.mileage, retail: result.retail, tradeIn: result.tradeIn, trimSelection: result.trimSelection, notes: result.notes }, null, 2));
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Vehicle lookup failed');
    process.exitCode = 1;
}
