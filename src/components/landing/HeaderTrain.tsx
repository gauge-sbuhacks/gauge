import { RailDivider } from '@/components/brand/Railway.tsx';

/** A right-facing engine. The wheels, counter-rotating gears and two plumes run in CSS. */
export function HeaderTrain() {
    return (
        <div className="landing-railway" aria-hidden="true">
            <div className="landing-train">
                <svg viewBox="0 0 204 94" fill="none">
                    <g className="train-steam train-steam-one">
                        <path d="M156 27c-8 2-14-2-13-7-8 1-12-5-8-10 2-4 8-4 11-1 4-7 15-5 15 2 8-1 12 6 7 11-2 3-7 4-12 5Z" fill="#fff" />
                    </g>
                    <g className="train-steam train-steam-two">
                        <path d="M156 27c-8 2-14-2-13-7-8 1-12-5-8-10 2-4 8-4 11-1 4-7 15-5 15 2 8-1 12 6 7 11-2 3-7 4-12 5Z" fill="#fff" />
                    </g>
                    {/* Coal tender, cab, brass boiler and copper smokestack. */}
                    <path d="M12 54h39v24H12z" fill="#5E3820" stroke="#D18D42" strokeWidth="2" />
                    <path d="m16 54 4-6 7 2 6-5 7 4 7-1 2 6" fill="#342719" stroke="#A87946" strokeWidth="1.5" />
                    <path d="M18 61h27m-27 5h27m6 8h9" stroke="#D18D42" strokeWidth="2" />
                    <path d="M60 41h34v36H60z" fill="#8F4C2E" stroke="#E0904A" strokeWidth="2" />
                    <path d="M56 40h42l-3-5H61z" fill="#E0A245" stroke="#F2D18B" strokeWidth="1.5" />
                    <path d="M66 46h10v15H66zm15 0h8v15h-8z" fill="#241B10" stroke="#D9AC62" strokeWidth="1.5" />
                    <path d="M94 50h67a12 12 0 0 1 0 24H94z" fill="#B97923" stroke="#E9BC66" strokeWidth="2" />
                    <path d="M105 51v22m35-22v22m-43-15h63" stroke="#F2D18B" strokeWidth="2" opacity=".7" />
                    <path d="M150 50V33h12v17m-15-18h18v-5h-18z" fill="#8F4C2E" stroke="#E0904A" strokeWidth="2" />
                    <path d="M116 50v-5a6 6 0 0 1 12 0v5" fill="#DDA746" stroke="#F2D18B" strokeWidth="1.5" />
                    <path d="M174 54h6v9h-6" fill="#F2E3C1" stroke="#D18D42" strokeWidth="2" />
                    <path d="M57 75h123m-1-4 15 15h-25" stroke="#D18D42" strokeWidth="4" strokeLinejoin="round" />
                    <path d="M184 77v8m4-5v5" stroke="#E9BC66" strokeWidth="1.5" />
                    {[23, 42].map((cx) => (
                        <g key={cx}>
                            <circle cx={cx} cy="81" r="7" fill="#241B10" stroke="#D18D42" strokeWidth="2" />
                            <g className="train-wheel">
                                <circle cx={cx} cy="81" r="4.5" stroke="#E9BC66" />
                                <path d={`M${cx - 5} 81h10m-5-5v10`} stroke="#E9BC66" />
                            </g>
                        </g>
                    ))}
                    {[76, 106, 136].map((cx) => (
                        <g key={cx}>
                            <circle cx={cx} cy="79" r="11" fill="#241B10" stroke="#E9BC66" strokeWidth="2" />
                            <g className="train-wheel">
                                <circle cx={cx} cy="79" r="8" stroke="#B97923" strokeWidth="1.5" />
                                {[0, 60, 120].map((angle) => <path key={angle} d={`M${cx - 8} 79h16`} transform={`rotate(${angle} ${cx} 79)`} stroke="#E9BC66" strokeWidth="1.5" />)}
                                <circle cx={cx} cy="79" r="2.5" fill="#E0904A" />
                            </g>
                        </g>
                    ))}
                    <g className="train-connecting-rod">
                        <path d="M76 79h60" stroke="#F2D18B" strokeWidth="3" strokeLinecap="round" />
                        <circle cx="76" cy="79" r="2" fill="#8F4C2E" />
                        <circle cx="136" cy="79" r="2" fill="#8F4C2E" />
                    </g>
                    {[{ cx: 100, cy: 65, reverse: false }, { cx: 114, cy: 65, reverse: true }].map(({ cx, cy, reverse }) => (
                        <g key={cx} className={reverse ? 'train-gear train-gear-reverse' : 'train-gear'}>
                            <circle cx={cx} cy={cy} r="5.5" fill="#382819" stroke="#F2D18B" strokeWidth="2.5" strokeDasharray="3 2" />
                            <circle cx={cx} cy={cy} r="2" fill="#E0904A" />
                            <path d={`M${cx - 4} ${cy}h8m-4-4v8`} stroke="#E9BC66" />
                        </g>
                    ))}
                    <circle cx="163" cy="81" r="7" fill="#241B10" stroke="#D18D42" strokeWidth="2" />
                    <g className="train-wheel">
                        <circle cx="163" cy="81" r="5" stroke="#E9BC66" />
                        <path d="M158 81h10m-5-5v10" stroke="#E9BC66" />
                    </g>
                </svg>
            </div>
            <RailDivider className="landing-train-track" />
        </div>
    );
}
