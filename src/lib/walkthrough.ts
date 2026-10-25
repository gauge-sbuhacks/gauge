// the guided first asset (/assets/new?guide=1): Gus explains each step of the add flow and can fill
// in an example car, so a new account sees how an item goes from blank boxes into the portfolio.
// anything saved with example details is stored as test data, so "remove test data" clears it.

import type { CategoryId } from '@shared/categories.ts';
import type { StepId } from './addAssetSteps.ts';

export const GUIDE_PARAM = 'guide';

export interface GuideTip {
    title: string;
    text: string;
}

// what the example car fills in at each step. none of it is a real vehicle or a real quote
const EXAMPLE: Partial<Record<StepId, Partial<Record<string, string>>>> = {
    identity: { 'details.year': '2021', brand: 'Toyota', model: 'RAV4', 'details.trim': 'XLE', name: '2021 Toyota RAV4 (example)' },
    details: { 'details.mileage': '32000', 'details.purchaseMileage': '6000', 'details.exteriorColor': 'Blue', 'details.titleStatus': 'clean' },
    condition: { condition: 'good', location: 'Garage' },
    money: { purchasePrice: '28500', purchaseDate: '2021-06-12', estimateAmount: '24500', quickSaleAmount: '21000' },
    proof: { notes: 'Example from the Gauge walkthrough. Remove it any time with the rest of the test data.' }
};

// the example only fits the vehicle questions
export function exampleFor(step: StepId, category: CategoryId | ''): Partial<Record<string, string>> | null {
    if (step === 'category' || category !== 'vehicle') return null;
    return EXAMPLE[step] ?? null;
}

// Gus's explanation for each step. car-specific when the example car is being added
export function guideTipFor(step: StepId, category: CategoryId | '', hasProviderEstimate: boolean): GuideTip {
    const car = category === 'vehicle';
    switch (step) {
        case 'category':
            return {
                title: "Let's add one together",
                text: 'The category decides which questions come next. We will use a car for the example, but you can pick anything you own and follow along.'
            };
        case 'identity':
            return car
                ? {
                      title: 'Only the name is required',
                      text: 'Year, make, and model are tagged "Helps the estimate": the market value is built on them. A VIN is optional, and decoding it fills these boxes in for you.'
                  }
                : {
                      title: 'Only the name is required',
                      text: 'Boxes tagged "Helps the estimate" are what the value is based on. Fill in what you know; the rest can wait.'
                  };
        case 'details':
            return car
                ? {
                      title: 'Mileage matters most',
                      text: 'Mileage and title move a car\'s value. Color and the mileage when you bought it are just for your records. Every box here can be skipped.'
                  }
                : {
                      title: 'Everything here is optional',
                      text: '"Helps the estimate" boxes sharpen the value. "For your records" boxes are just for you, for insurance or when you sell.'
                  };
        case 'condition':
            return {
                title: 'Condition changes the price',
                text: 'Condition helps the estimate. Where it is kept is just for your records, but it is handy if you ever file an insurance claim.'
            };
        case 'money':
            return {
                title: 'What you paid, and what it is worth now',
                text: `Purchase price is your cost basis, so Gauge can show a gain or loss. For the current value, ${car && hasProviderEstimate ? 'press "Get market value" for a live estimate, or ' : ''}type your own number. Every value is labeled "Market data", "AI estimate", or "Manual entry", so you always know where it came from.`
            };
        case 'proof':
            return {
                title: 'Notes are just for you',
                text: 'Serial numbers and notes make an insurance claim easier. Save, and the item lands in your portfolio with its value history started.'
            };
    }
}

// only fill boxes that are still empty, so nothing you typed is overwritten
export function applyExample(fill: Partial<Record<string, string>>, getValue: (field: string) => unknown, setValue: (field: string, value: string) => void): number {
    let filled = 0;
    for (const [field, value] of Object.entries(fill)) {
        if (value == null) continue;
        const current = getValue(field);
        if (typeof current === 'string' && current.trim() !== '') continue;
        setValue(field, value);
        filled++;
    }
    return filled;
}
