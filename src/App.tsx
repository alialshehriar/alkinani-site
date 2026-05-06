import { useEffect, useState } from "react";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Origin from "./components/Origin";
import Ventures from "./components/Ventures";
import Method from "./components/Method";
import AskTerminal from "./components/AskTerminal";
import PressureTest from "./components/PressureTest";
import Stack from "./components/Stack";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import MagneticCursor from "./components/MagneticCursor";
import ScrollProgress from "./components/ScrollProgress";
import EasterEgg from "./components/EasterEgg";
import MobileBottomBar from "./components/MobileBottomBar";
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

  return (
    <div className="relative min-h-screen w-full bg-ink-950 text-ink-100">
      <ScrollProgress />
      <MagneticCursor />
      <Nav lang={lang} setLang={setLang} />
      <main>
        <Hero lang={lang} />
        <Origin lang={lang} />
        <Ventures lang={lang} />
        <Method lang={lang} />
        <PressureTest lang={lang} />
        <AskTerminal lang={lang} />
        <Stack lang={lang} />
        <Contact lang={lang} />
      </main>
      <Footer lang={lang} />
      <MobileBottomBar lang={lang} />
      <EasterEgg lang={lang} />
    </div>
  );
}
