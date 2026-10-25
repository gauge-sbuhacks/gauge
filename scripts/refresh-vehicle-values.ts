// Run due monthly updates on a server with no hosting scheduler. Does not refresh early.
import fs from 'node:fs';
import mongoose from 'mongoose';
import { connectDb } from '../server/db/connect.js';
import { runMonthlyVehicleRefreshes } from '../server/vehicles/monthly.js';

for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) process.loadEnvFile(file);
try {
    await connectDb();
    console.log(await runMonthlyVehicleRefreshes());
} catch {
    console.error('Vehicle refresh could not complete. Check the database and provider configuration.');
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
