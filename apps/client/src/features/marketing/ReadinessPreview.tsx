import { Badge } from "@/components/ui/badge";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { BAND_LABEL, bandTextClass, masteryBand } from "@/lib/mastery";

/**
 * A static preview of the real dashboard, built from the same gauge and sparkline
 * components the app uses — so what a visitor sees here is what they get,
 * not a mockup that drifts out of date. Numbers are illustrative and labelled
 * as such.
 */
const DOMAINS = [
  { code: "1.0", name: "Networking Concepts", mastery: 84 },
  { code: "2.0", name: "Implementation", mastery: 71 },
  { code: "3.0", name: "Operations", mastery: 52 },
  { code: "4.0", name: "Security", mastery: 38 },
];

const TREND = [610, 645, 638, 690, 722];

export function ReadinessPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-xl border border-border bg-card p-5 text-left shadow-sm">
      <Badge variant="secondary" className="absolute right-4 top-4">
        example
      </Badge>

      <div className="flex items-center gap-4">
        <RadialGauge value={68} size={88} strokeWidth={9} sweep={270} label="Example readiness: 68 percent">
          <span className="stat-numeral text-2xl font-bold">
            68<span className="text-sm font-semibold">%</span>
          </span>
        </RadialGauge>
        <div>
          <div className="text-sm font-semibold">Readiness</div>
          <div className={`text-xs font-medium ${bandTextClass(masteryBand(68))}`}>
            {BAND_LABEL[masteryBand(68)]}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            recency-weighted mastery × exam weights
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2.5 border-t border-border pt-4">
        {DOMAINS.map((d) => (
          <div key={d.code} className="flex items-center gap-3">
            <RadialGauge
              value={d.mastery}
              size={34}
              strokeWidth={4}
              label={`${d.name}: ${d.mastery} percent`}
            />
            <span className="min-w-0 flex-1 truncate text-xs">{d.name}</span>
            <span className={`stat-numeral text-xs font-medium ${bandTextClass(masteryBand(d.mastery))}`}>
              {d.mastery}%
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
        <div>
          <div className="text-xs font-medium">Mock exam trend</div>
          <div className="text-xs text-muted-foreground">dashed = pass mark</div>
        </div>
        <Sparkline
          values={TREND}
          threshold={700}
          width={128}
          height={36}
          label="Example mock exam scores trending above the pass mark"
        />
      </div>
    </div>
  );
}
