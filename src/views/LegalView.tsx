// the three legal pages: privacy policy, terms of service, and accessibility statement.
// public (no sign-in needed) and linked from every footer. the text lives in DOCS below.

import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { SiteFooter } from '@/components/layout/SiteFooter.tsx';
import { APP_NAME } from '@/config.ts';

export type LegalDoc = 'privacy' | 'terms' | 'accessibility';

const UPDATED = 'October 25, 2026';
const REPO = 'https://github.com/gauge-sbuhacks/gauge';

const Contact = () => (
    <a href={`${REPO}/issues`} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">
        opening an issue on the project's GitHub page
    </a>
);

interface Section {
    heading: string;
    body: ReactNode;
}

const DOCS: Record<LegalDoc, { title: string; intro: ReactNode; sections: Section[] }> = {
    privacy: {
        title: 'Privacy Policy',
        intro: (
            <>
                {APP_NAME} is a net-worth tracker for physical belongings, built by a student team at SBU Hacks 2026 (Stony Brook University). This policy explains what we collect, why,
                and who else touches it. A record of what you own is sensitive, so we keep it to what the app needs.
            </>
        ),
        sections: [
            {
                heading: 'What we collect',
                body: (
                    <ul>
                        <li>
                            <strong>Your account.</strong> Your name, email address, and sign-in method, handled by our sign-in provider, Clerk.
                        </li>
                        <li>
                            <strong>Your onboarding answers.</strong> What you'd like to be called, the city, state, and postal code you sell from, and why you use {APP_NAME}.
                        </li>
                        <li>
                            <strong>What you record.</strong> Your assets and everything you enter about them: names, categories, details such as a home address, VIN, or serial number,
                            purchase prices and dates, values, condition, where items are kept, and notes.
                        </li>
                    </ul>
                )
            },
            {
                heading: 'How we use it',
                body: (
                    <p>
                        Only to run {APP_NAME} for you: showing your portfolio, charts, and value history, producing the exports you ask for, and running the value lookups you request. We
                        don't sell your information, show ads, or use advertising or analytics trackers.
                    </p>
                )
            },
            {
                heading: 'Who else handles it',
                body: (
                    <>
                        <p>These services run parts of {APP_NAME} and process data on our behalf:</p>
                        <ul>
                            <li>
                                <strong>Clerk</strong> for sign-in and accounts.
                            </li>
                            <li>
                                <strong>MongoDB Atlas</strong> to store your records.
                            </li>
                            <li>
                                <strong>Vercel</strong> to host the site.
                            </li>
                        </ul>
                        <p>
                            Value lookups only run when you ask for one, and send only what that lookup needs. A home estimate sends the property's address and details to RentCast. A VIN
                            decode or recall check sends the VIN, or the make, model, and year, to the U.S. National Highway Traffic Safety Administration (NHTSA). A vehicle value sends
                            vehicle details to VinAudit. Card prices use the card's set and number (TCGdex, Scryfall, MTGJSON), metal values use the metal type (gold-api.com), and market
                            research sends a search built from the item's name, brand, and model, plus your general selling area, to eBay. Each provider has its own privacy policy.
                        </p>
                        <p>Links such as "Sell this item" open other websites. What you do there is covered by their policies, not ours.</p>
                    </>
                )
            },
            {
                heading: 'Who can see your records',
                body: (
                    <p>
                        Each account sees only its own assets. Members of the {APP_NAME} team can technically access the database to run and fix the service, and only do so when needed.
                    </p>
                )
            },
            {
                heading: 'Cookies and storage',
                body: <p>Clerk uses cookies to keep you signed in. We don't use cookies for advertising or tracking.</p>
            },
            {
                heading: 'Keeping and deleting your data',
                body: (
                    <p>
                        You can edit or delete any asset at any time, and "Remove test data" deletes the sample portfolio. To delete your whole account and everything in it, contact us
                        (below) and we'll remove it.
                    </p>
                )
            },
            {
                heading: 'Security',
                body: (
                    <p>
                        Data travels over encrypted connections (HTTPS) and is stored with access controls. {APP_NAME} is a hackathon project, though, so please don't store anything you
                        couldn't afford to have exposed, such as account numbers or the combination to your safe.
                    </p>
                )
            },
            {
                heading: 'Children',
                body: <p>{APP_NAME} isn't meant for children under 13, and we don't knowingly collect information from them.</p>
            },
            {
                heading: 'Changes and contact',
                body: (
                    <p>
                        If this policy changes, we'll update the date at the top. Questions or requests? Reach the team by <Contact />.
                    </p>
                )
            }
        ]
    },
    terms: {
        title: 'Terms of Service',
        intro: (
            <>
                These terms cover your use of {APP_NAME}, a student project built at SBU Hacks 2026. By creating an account or using the site, you agree to them.
            </>
        ),
        sections: [
            {
                heading: 'What Gauge is, and isn\'t',
                body: (
                    <p>
                        {APP_NAME} helps you keep a record of what you own and estimate what it's worth. Every value it shows is an <strong>estimate, not an appraisal</strong>. Nothing in{' '}
                        {APP_NAME} is financial, investment, tax, insurance, or legal advice. For a claim, a sale, a loan, or a tax filing, get a qualified professional's opinion.
                    </p>
                )
            },
            {
                heading: 'Your account',
                body: <p>Keep your sign-in details to yourself, and tell us if you think someone else has used your account. You're responsible for what happens under it.</p>
            },
            {
                heading: 'Your content',
                body: (
                    <p>
                        What you enter stays yours. You give us permission to store and process it only as needed to run {APP_NAME} for you, including sending the details a lookup needs
                        to the provider you asked to use. Only enter information you have the right to share.
                    </p>
                )
            },
            {
                heading: 'Fair use',
                body: (
                    <ul>
                        <li>Don't try to access other people's accounts or data.</li>
                        <li>Don't overload, scrape, or attack the service, or use it to break the law.</li>
                        <li>Don't use the value lookups in bulk or to resell their data. They come from providers with their own limits and terms.</li>
                    </ul>
                )
            },
            {
                heading: 'Third-party data and links',
                body: (
                    <p>
                        Values, recalls, comparables, and listings come from outside providers such as RentCast, NHTSA, VinAudit, and eBay. We pass them along as-is and can't promise they're
                        complete or current. Links to other sites are for convenience, and those sites have their own terms.
                    </p>
                )
            },
            {
                heading: 'No guarantees',
                body: (
                    <p>
                        {APP_NAME} is provided "as is" and "as available". We may change, pause, or shut it down at any time, and we can't promise it will be error-free or that data will
                        never be lost. Keep your own copies of anything important; the CSV and PDF exports are there for that.
                    </p>
                )
            },
            {
                heading: 'Limits on liability',
                body: (
                    <p>
                        To the extent the law allows, the {APP_NAME} team isn't liable for losses that come from using the site or relying on its estimates, including a value that turns
                        out higher or lower than what something actually sells or is insured for.
                    </p>
                )
            },
            {
                heading: 'Ending things',
                body: <p>You can stop using {APP_NAME} at any time and ask us to delete your account. We may suspend accounts that break these terms.</p>
            },
            {
                heading: 'Changes and contact',
                body: (
                    <p>
                        If these terms change, we'll update the date at the top, and using {APP_NAME} after that means you accept the new version. Questions? Reach the team by <Contact />.
                    </p>
                )
            }
        ]
    },
    accessibility: {
        title: 'Accessibility Statement',
        intro: (
            <>
                We want everyone to be able to keep track of what they own, including people who use a keyboard, a screen reader, magnification, or other assistive technology. Our goal
                is to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.
            </>
        ),
        sections: [
            {
                heading: 'What we do',
                body: (
                    <ul>
                        <li>Every page and form works with a keyboard, with a visible focus outline.</li>
                        <li>Form fields have labels, and errors appear next to the field they belong to, in words.</li>
                        <li>Gains and losses use a plus or minus sign and an arrow, not just green and red.</li>
                        <li>Chart colors are chosen to stay distinct for common types of color blindness, and charts come with labels, legends, and the numbers in text.</li>
                        <li>Missing values say "Not entered" instead of showing a misleading $0.</li>
                        <li>Animations are short and turn off when your device is set to reduce motion.</li>
                        <li>Pages work on small screens down to 375 pixels wide and when zoomed in.</li>
                    </ul>
                )
            },
            {
                heading: 'Known gaps',
                body: (
                    <ul>
                        <li>Some charts are easier to read visually than with a screen reader. The same numbers appear in nearby lists and tables.</li>
                        <li>The sign-in and sign-up forms are provided by Clerk, so their accessibility depends partly on Clerk.</li>
                        <li>Exported PDFs may not be fully tagged for screen readers. The CSV export has the same information in a plain table.</li>
                        <li>{APP_NAME} is a new hackathon project and hasn't had a formal accessibility audit yet.</li>
                    </ul>
                )
            },
            {
                heading: 'Tell us what isn\'t working',
                body: (
                    <p>
                        If something in {APP_NAME} is hard to use, we want to know. Tell us the page and what happened by <Contact />, and we'll do our best to fix it or get you the
                        information another way.
                    </p>
                )
            }
        ]
    }
};

export default function LegalView({ doc }: { doc: LegalDoc }) {
    const page = DOCS[doc];
    useEffect(() => {
        document.title = `${page.title} · ${APP_NAME}`;
        return () => {
            document.title = APP_NAME;
        };
    }, [page.title]);

    return (
        <div className="flex min-h-svh flex-col bg-background">
            <header className="border-b">
                <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
                    <Link to="/home" aria-label={`${APP_NAME} home`}>
                        <Logo />
                    </Link>
                    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft className="size-4" />
                        Back to {APP_NAME}
                    </Link>
                </div>
            </header>

            <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
                <p className="mt-6 leading-relaxed">{page.intro}</p>

                <div className="mt-10 space-y-9">
                    {page.sections.map((s) => (
                        <section key={s.heading} className="space-y-3 leading-relaxed text-foreground/90 [&_li]:pl-1 [&_li+li]:mt-2 [&_ul]:list-disc [&_ul]:space-y-0 [&_ul]:pl-5 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul+p]:mt-3">
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">{s.heading}</h2>
                            {s.body}
                        </section>
                    ))}
                </div>
            </main>

            <SiteFooter width="max-w-3xl" />
        </div>
    );
}
