import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/react";
import { MobileTopBar } from "./mobile-top-bar";
import { buttonClass } from "./ui/button";
import { ArrowLeftIcon } from "./ui/icons";
import { UserGuideContent } from "./user-guide-content";

export function HelpPage() {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = t("help_doc_title");
    heading.current?.focus();
  }, [t]);
  return (
    <>
      <MobileTopBar label={t("help_guide")} />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <Link to="/settings" className={buttonClass({ variant: "ghost" }, "mb-6 pl-0")}>
          <ArrowLeftIcon />
          {t("help_back_settings")}
        </Link>
        <UserGuideContent headingRef={heading} />
      </div>
    </>
  );
}
