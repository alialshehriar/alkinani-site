import { useEffect, useState } from "react";
import Nav from "./components/Nav";
import Tools from "./components/Tools";
import TurjumanApp from "./components/turjuman/TurjumanApp";
import Hero from "./components/Hero";
import Origin from "./components/Origin";
import Radar from "./components/Radar";
import Ventures from "./components/Ventures";
import SectionBridge from "./components/SectionBridge";
import Method from "./components/Method";
import AskTerminal from "./components/AskTerminal";
import PlayLab from "./components/PlayLab";
import Throne from "./components/Throne";
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

  // Standalone routes — bypass the scroll-narrative shell.
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path === "/tools/turjuman" || path.startsWith("/tools/turjuman/")) {
      return <TurjumanApp />;
    }
    if (path === "/tools" || path === "/tools/") {
      return <Tools lang={lang} />;
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
          to="#radar"
          lang={lang}
          ar="رادار AI — إشارات تُرصد قبل ما تنتشر"
          en="AI radar — signals caught before the trend"
        />

        <Radar lang={lang} />
        <SectionBridge
          to="#lab"
          lang={lang}
          ar="اختبر سرعة قراراتك — ٣ ألعاب"
          en="Test your decision speed — 3 games"
        />

        <PlayLab lang={lang} />
        <SectionBridge
          to="#throne"
          lang={lang}
          ar="شف صدارة الأبطال — وحاول تطيحهم"
          en="See the leaderboard — try to topple it"
        />

        <Throne lang={lang} />
        <SectionBridge
          to="#ask"
          lang={lang}
          ar="محادثة مباشرة — اسأل عن أي شي"
          en="Direct chat — ask anything"
        />

        <AskTerminal lang={lang} />
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
