import React, { useMemo, useRef, useState } from "react";
import {
  getApiRateLimitDescription,
  getApiRateLimitLabel,
  getColumnRelatedBucketKeys,
  isColumnRelatedApiBucket,
} from "@/constants/apiRateLimitLabels";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { getRateLimitSeverity } from "@/lib/apiRateLimit";
import type { Account, ApiRateLimitBucket } from "@/types";
import styles from "./ApiRateLimitIndicator.module.scss";

interface ApiRateLimitIndicatorProps {
  accounts: Account[];
  apiRateLimits: Record<string, Record<string, ApiRateLimitBucket>>;
  onOpenChange?: (isOpen: boolean) => void;
  isMobile?: boolean;
}

type BucketListItem =
  | { bucketKey: string; observed: true; bucket: ApiRateLimitBucket }
  | { bucketKey: string; observed: false };

type Severity = "normal" | "warning" | "critical";

const SEVERITY_ORDER: Record<Severity, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

/**
 * reset（Unix秒）から「あとN分」形式のラベルを作る。
 * 0分以下（既に経過済み・まもなく解除）の場合は「まもなく」と表示する。
 */
function formatResetLabel(resetUnixSeconds: number): string {
  const minutes = Math.max(
    0,
    Math.round((resetUnixSeconds * 1000 - Date.now()) / 60000),
  );
  return minutes <= 0 ? "まもなく" : `あと${minutes}分`;
}

function joinClassNames(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export const ApiRateLimitIndicator: React.FC<ApiRateLimitIndicatorProps> = ({
  accounts,
  apiRateLimits,
  onOpenChange,
  isMobile = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  useEscapeKey(close);
  useOutsideClick(containerRef, close, isOpen);

  const overallSeverity = useMemo<Severity>(() => {
    let worst: Severity = "normal";
    for (const buckets of Object.values(apiRateLimits)) {
      for (const bucket of Object.values(buckets)) {
        if (!isColumnRelatedApiBucket(bucket.bucketKey)) continue;
        const severity = getRateLimitSeverity(bucket.remaining, bucket.limit);
        if (SEVERITY_ORDER[severity] > SEVERITY_ORDER[worst]) {
          worst = severity;
        }
      }
    }
    return worst;
  }, [apiRateLimits]);

  const triggerClassName = joinClassNames(
    styles.trigger,
    overallSeverity === "critical" && styles.triggerCritical,
    overallSeverity === "warning" && styles.triggerWarning,
  );

  const popoverContent = (
    <>
      {accounts.length === 0 && <p className={styles.empty}>データなし</p>}
      {accounts.map((account) => {
        const observedBuckets = apiRateLimits[account.id] ?? {};
        const bucketList: BucketListItem[] = getColumnRelatedBucketKeys().map(
          (bucketKey) => {
            const observed = observedBuckets[bucketKey];
            return observed
              ? { bucketKey, observed: true as const, bucket: observed }
              : { bucketKey, observed: false as const };
          },
        );

        return (
          <div key={account.id} className={styles.accountSection}>
            <div className={styles.accountHeader}>
              <span
                className={styles.dot}
                style={{ backgroundColor: account.color }}
              />
              <span className={styles.accountLabel}>{account.label}</span>
            </div>
            <ul className={styles.bucketList}>
              {bucketList.map((item) => {
                if (!item.observed) {
                  const description = getApiRateLimitDescription(
                    item.bucketKey,
                  );
                  const unobservedNote = "（まだ使用されていないため未計測）";

                  return (
                    <li key={item.bucketKey} className={styles.bucketRow}>
                      <div className={styles.bucketMain}>
                        <span className={styles.bucketLabel}>
                          {getApiRateLimitLabel(item.bucketKey)}
                        </span>
                        <span className={styles.bucketRemaining}>-/-</span>
                        <span className={styles.bucketReset}>-</span>
                      </div>
                      <p className={styles.bucketDescription}>
                        {description
                          ? `${description}${unobservedNote}`
                          : unobservedNote}
                      </p>
                    </li>
                  );
                }

                const { bucket } = item;
                const severity = getRateLimitSeverity(
                  bucket.remaining,
                  bucket.limit,
                );
                const rowClassName = joinClassNames(
                  styles.bucketRow,
                  severity === "warning" && styles.warning,
                  severity === "critical" && styles.critical,
                );
                const description = getApiRateLimitDescription(
                  bucket.bucketKey,
                );

                return (
                  <li key={bucket.bucketKey} className={rowClassName}>
                    <div className={styles.bucketMain}>
                      <span className={styles.bucketLabel}>
                        {getApiRateLimitLabel(bucket.bucketKey)}
                      </span>
                      <span className={styles.bucketRemaining}>
                        {bucket.remaining}/{bucket.limit}
                      </span>
                      <span className={styles.bucketReset}>
                        {formatResetLabel(bucket.reset)}
                      </span>
                    </div>
                    {description && (
                      <p className={styles.bucketDescription}>{description}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={triggerClassName}
        onClick={() =>
          setIsOpen((prev) => {
            const next = !prev;
            onOpenChange?.(next);
            return next;
          })
        }
        aria-label="APIレート制限"
        aria-expanded={isOpen}
        title="APIレート制限"
      >
        API
      </button>
      {isOpen && isMobile && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          role="presentation"
        >
          <div
            className={joinClassNames(styles.popover, styles.popoverMobile)}
            role="dialog"
            aria-label="APIレート制限一覧"
          >
            {popoverContent}
          </div>
        </div>
      )}
      {isOpen && !isMobile && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="APIレート制限一覧"
        >
          {popoverContent}
        </div>
      )}
    </div>
  );
};
