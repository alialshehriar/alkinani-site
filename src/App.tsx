import { lazy, Suspense, useEffect, useState } from "react";
import Nav from "./components/Nav";
// Turjuman and the Tools index are full-screen routes — they replace the
// scroll narrative entirely. Lazy-loading keeps them out of the initial
// home bundle (saves ~150kB pre-minify on the / route, the most-hit page).
const Tools = lazy(() => import("./components/Tools"));
const TurjumanApp = lazy(() => import("./components/turjuman/TurjumanApp"));
import Hero from "./components/Hero";
import Origin from "./components/Origin";
import ToolsLab from "./components/ToolsLab";
import Ventures from "./components/Ventures";
import SectionBridge from "./components/SectionBridge";
import Method from "./components/Method";
// Heavy below-the-fold sections — lazy so the first paint doesn't pay
// for the leaderboard, the 3 mini-games, and the chat terminal.
const AskTerminal = lazy(() => import("./components/AskTerminal"));
const PlayLab = lazy(() => import("./components/PlayLab"));
const Throne = lazy(() => import("./components/Throne"));
import Stack from "./components/Stack";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import MagneticCursor from "./components/MagneticCursor";
import ScrollProgress from "./components/ScrollProgress";
import EasterEgg from "./components/EasterEgg";
import MobileBottomBar from "./components/MobileBottomBar";
import ChapterDots from "./components/ChapterDots";
import type { Lang } from "./lib/i18n";

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ar";
    return (localStorage.getItem("alk-lang") as Lang) || "ar";
  });

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("alk-lang", lang); } catch { /* ignore */ }
  }, [lang]);

  // Standalone routes — bypass the scroll-narrative shell. Each gets its
  // own Suspense boundary with a minimal full-screen fallback so the page
  // doesn't pop in late on slow networks.
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path === "/tools/turjuman" || path.startsWith("/tools/turjuman/")) {
      return (
        <Suspense fallback={<RouteSpinner />}>
          <TurjumanApp />
        </Suspense>
      );
    }
    if (path === "/tools" || path === "/tools/") {
      return (
        <Suspense fallback={<RouteSpinner />}>
          <Tools lang={lang} />
        </Suspense>
      );
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-ink-950 text-ink-100">
      <ScrollProgress />
      <ChapterDots lang={lang} />
      <MagneticCursor />
      <Nav lang={lang} setLang={setLang} />
      <main>
        <Hero lang={lang} />

        <Origin lang={lang} />
        <SectionBridge
          to="#work"
          lang={lang}
          ar="ثلاثة منتجات بُنيت بين شفتَي البحر — شفها"
          en="Three products built between work shifts — see them"
        />

        <Ventures lang={lang} />
        <SectionBridge
          to="#tools"
          lang={lang}
          ar="أدوات شغّالة — ترجمان والرادار"
          en="Working tools — Turjuman and Radar"
        />

        <ToolsLab lang={lang} />
        <SectionBridge
          to="#lab"
          lang={lang}
          ar="اختبر سرعة قراراتك — ٣ ألعاب"
          en="Test your decision speed — 3 games"
        />

        <Suspense fallback={<SectionSkeleton />}>
          <PlayLab lang={lang} />
        </Suspense>
        <SectionBridge
          to="#throne"
          lang={lang}
          ar="شف صدارة الأبطال — وحاول تطيحهم"
          en="See the leaderboard — try to topple it"
        />

        <Suspense fallback={<SectionSkeleton />}>
          <Throne lang={lang} />
        </Suspense>
        <SectionBridge
          to="#ask"
          lang={lang}
          ar="محادثة مباشرة — اسأل عن أي شي"
          en="Direct chat — ask anything"
        />

        <Suspense fallback={<SectionSkeleton />}>
          <AskTerminal lang={lang} />
        </Suspense>
        <SectionBridge
          to="#method"
          lang={lang}
          ar="كيف تُبنى الأنظمة — الطريقة"
          en="How the systems get built — the method"
        />

        <Method lang={lang} />
        <Stack lang={lang} />
        <Contact lang={lang} />
      </main>
      <Footer lang={lang} />
      <MobileBottomBar lang={lang} />
      <EasterEgg lang={lang} />
    </div>
  );
}

function RouteSpinner() {
  return (
    <div
      role="status"
      aria-label="جارٍ التحميل"
      className="grid min-h-screen w-full place-items-center bg-ink-950"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-700 border-t-ember-400" />
    </div>
  );
}

function SectionSkeleton() {
  return <div aria-hidden className="h-[60vh] w-full bg-ink-950" />;
}
