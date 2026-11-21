import React, { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusMark } from "@/components/StatusMark/StatusMark";
import {
  getApiRateLimitDescription,
  getApiRateLimitLabel,
  getColumnRelatedBucketKeys,
  isColumnRelatedApiBucket,
} from "@/constants/apiRateLimitLabels";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { AppTFunction } from "@/i18n/types";
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
function formatResetLabel(resetUnixSeconds: number, t: AppTFunction): string {
  const minutes = Math.max(
    0,
    Math.round((resetUnixSeconds * 1000 - Date.now()) / 60000),
  );
  return minutes <= 0
    ? t("rateLimit:indicator.soon")
    : t("rateLimit:indicator.resetInMinutes", { count: minutes });
}

/** 色に頼らず、警告・危険を支援技術へ伝える文言 */
function severityText(
  severity: Exclude<Severity, "normal">,
  t: AppTFunction,
): string {
  return severity === "critical"
    ? t("rateLimit:indicator.severityCritical")
    : t("rateLimit:indicator.severityWarning");
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const severityId = useId();

  const close = () => {
    setIsOpen(false);
    onOpenChange?.(false);
  };

  // Escape で閉じたときは、開いたトリガーへフォーカスを戻す（外側クリックではフォーカスを奪わない）
  const closeByEscape = () => {
    if (!isOpen) return;
    close();
    triggerRef.current?.focus();
  };

  useEscapeKey(closeByEscape);
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
      {accounts.length === 0 && (
        <p className={styles.empty}>{t("rateLimit:indicator.noData")}</p>
      )}
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
                    t,
                  );
                  return (
                    <li key={item.bucketKey} className={styles.bucketRow}>
                      <div className={styles.bucketMain}>
                        <span className={styles.bucketLabel}>
                          {getApiRateLimitLabel(item.bucketKey, t)}
                        </span>
                        <span className={styles.bucketRemaining}>-/-</span>
                        <span className={styles.bucketReset}>-</span>
                      </div>
                      <p className={styles.bucketDescription}>
                        {description
                          ? t("rateLimit:indicator.unobservedWithDescription", {
                              description,
                            })
                          : t("rateLimit:indicator.unobserved")}
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
                  t,
                );

                return (
                  <li key={bucket.bucketKey} className={rowClassName}>
                    <div className={styles.bucketMain}>
                      {severity !== "normal" && (
                        <>
                          <StatusMark kind="warning" />
                          <span className={styles.visuallyHidden}>
                            {severityText(severity, t)}
                          </span>
                        </>
                      )}
                      <span className={styles.bucketLabel}>
                        {getApiRateLimitLabel(bucket.bucketKey, t)}
                      </span>
                      <span className={styles.bucketRemaining}>
                        {bucket.remaining}/{bucket.limit}
                      </span>
                      <span className={styles.bucketReset}>
                        {formatResetLabel(bucket.reset, t)}
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
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={() =>
          setIsOpen((prev) => {
            const next = !prev;
            onOpenChange?.(next);
            return next;
          })
        }
        aria-label={t("rateLimit:indicator.triggerLabel")}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        aria-describedby={overallSeverity === "normal" ? undefined : severityId}
        title={t("rateLimit:indicator.triggerLabel")}
      >
        {overallSeverity !== "normal" && <StatusMark kind="warning" />}
        API
      </button>
      {overallSeverity !== "normal" && (
        <span id={severityId} className={styles.visuallyHidden}>
          {severityText(overallSeverity, t)}
        </span>
      )}
      {isOpen && isMobile && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          role="presentation"
        >
          <div
            id={popoverId}
            className={joinClassNames(styles.popover, styles.popoverMobile)}
            role="dialog"
            aria-label={t("rateLimit:indicator.listLabel")}
          >
            {popoverContent}
          </div>
        </div>
      )}
      {isOpen && !isMobile && (
        <div
          id={popoverId}
          className={styles.popover}
          role="dialog"
          aria-label={t("rateLimit:indicator.listLabel")}
        >
          {popoverContent}
        </div>
      )}
    </div>
  );
};
