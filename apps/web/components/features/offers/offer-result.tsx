import type { OfferChangeResult } from "@/lib/validators/offer";

/**
 * What an offer change did (B7.3a, D147): each line it rewrote, before (struck through) and
 * after, under its section; then, as warnings, any old fact still on the page and any percent or
 * price a new line states that isn't the new offer's; then the lines it left that sound like a
 * deal, to look at.
 */
export function OfferResult({ result }: { result: OfferChangeResult }) {
  return (
    <div className="flex flex-col gap-3">
      {result.changed.length === 0 ? (
        <p className="text-type-caption-1 text-heading-05">
          No line of the page mentioned the old offer; the prices, promo line
          and buttons changed.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Lines changed">
          {result.changed.map((line, index) => (
            <li
              key={index}
              className="flex flex-col gap-0.5 rounded-md bg-foreground-01 p-2 text-type-caption-1"
            >
              {line.section ? (
                <span className="text-type-caption-2 font-medium text-heading-05">
                  {line.section}
                </span>
              ) : null}
              <s className="text-sub-text">{line.before}</s>
              <span className="text-heading-01">{line.after}</span>
            </li>
          ))}
        </ul>
      )}
      {result.leftovers.length > 0 ||
      result.invented.length > 0 ||
      result.overreach.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Check these">
          {result.leftovers.map((line, index) => (
            <li
              key={`l${index}`}
              className="rounded-md bg-tint-yellow p-2 text-type-caption-1 text-heading-02"
            >
              {`Still says ${line.old.join(", ")}: `}
              <span className="text-heading-01">{line.text}</span>
            </li>
          ))}
          {result.overreach.map((line, index) => (
            <li
              key={`o${index}`}
              className="rounded-md bg-tint-yellow p-2 text-type-caption-1 text-heading-02"
            >
              {`Also dropped “${line.dropped.join(", ")}”: `}
              <span className="text-heading-01">{line.text}</span>
            </li>
          ))}
          {result.invented.map((line, index) => (
            <li
              key={`i${index}`}
              className="rounded-md bg-tint-yellow p-2 text-type-caption-1 text-heading-02"
            >
              {`${line.found.join(", ")} isn't this offer: `}
              <span className="text-heading-01">{line.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {result.hints.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-type-caption-2 font-medium text-heading-05">
            Left as they were, but they sound like a deal. Have a look:
          </p>
          <ul className="flex flex-col gap-1" aria-label="Lines to look at">
            {result.hints.map((line, index) => (
              <li key={index} className="text-type-caption-1 text-heading-02">
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
