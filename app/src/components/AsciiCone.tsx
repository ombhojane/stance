"use client";

import { useEffect, useRef } from "react";
import { ASSETS, AssetId, Direction, expiryLabel, yearsUntil } from "@/lib/market";
import { useTheme } from "./Theme";

/**
 * The hero visual: every price the market thinks is possible between today
 * and your date, drawn as ASCII. The part of the cone where you'd win lights
 * up. A few sample journeys fly from today toward your flag. Drag the flag.
 */
interface Props {
  asset: AssetId;
  dir: Direction;
  target: number;
  expiry: string;
  spot: number;
  chance: number;
  onTarget?: (price: number) => void;
  /** background mode: just the field, the journeys and the pointer wake */
  quiet?: boolean;
}

const RAMP = " .·:-=+*#%@";
const CW = 9; // cell width (css px)
const CH = 15; // cell height

function hash(a: number, b: number, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function AsciiCone({ asset, dir, target, expiry, spot, chance, onTarget, quiet = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const props = useRef({ asset, dir, target, expiry, spot, chance, onTarget, quiet });
  props.current = { asset, dir, target, expiry, spot, chance, onTarget, quiet };
  const geo = useRef<{ rowToPrice: (y: number) => number; priceToY: (p: number) => number; flagX: number }>({ rowToPrice: () => 0, priceToY: () => 0, flagX: 0 });
  const dragging = useRef(false);
  // pointer wake: recent cursor positions; glyphs near them bloom, then decay
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d")!;
    let w = 0,
      h = 0,
      dpr = 1,
      raf = 0,
      baseKey = "",
      paths: number[][] = [],
      pathSeed = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MONO = `${cssVar("--font-jetbrains-mono") || "ui-monospace"}, ui-monospace, monospace`;
    const SANS = `${cssVar("--font-inter-tight") || "ui-sans-serif"}, ui-sans-serif, system-ui`;
    // only animate while the hero is on screen and the tab is visible, capped at ~30fps
    let onScreen = true;
    let last = 0;

    const colors = () => ({
      bg: cssVar("--hero-bg"),
      ink: cssVar("--hero-ink"),
      win: cssVar("--hero-win"),
      lose: cssVar("--hero-lose"),
      down: cssVar("--down"),
      accent: cssVar("--accent"),
      onAccent: cssVar("--on-accent"),
      tile: cssVar("--tile"),
      text: cssVar("--ink"),
    });
    let C = colors();

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      for (const c of [el, base]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      baseKey = "";
    };

    const layout = () => {
      const p = props.current;
      const a = ASSETS[p.asset];
      const cols = Math.floor(w / CW);
      const rows = Math.floor(h / CH);
      const x0 = p.quiet ? 0 : Math.max(3, Math.round(cols * 0.07));
      const xE = Math.round(cols * (p.quiet ? 0.94 : w < 640 ? 0.8 : 0.84));
      const T = yearsUntil(p.expiry);
      const sdT = a.vol * Math.sqrt(T);
      const half = Math.max(1.7 * sdT, Math.abs(Math.log(p.target / p.spot)) * 1.3, 0.05);
      const mid = Math.log(p.spot);
      // phones: the headline wraps to two lines, so the plot starts lower
      const rTop = rows * (p.quiet ? 0.2 : w < 640 ? 0.5 : 0.34);
      const rBot = rows * (p.quiet ? 0.95 : 0.8);
      const rowToLn = (r: number) => mid + half - ((r - rTop) / (rBot - rTop)) * 2 * half;
      const lnToRow = (ln: number) => rTop + ((mid + half - ln) / (2 * half)) * (rBot - rTop);
      return { a, cols, rows, x0, xE, T, mid, half, rTop, rBot, rowToLn, lnToRow };
    };

    const buildBase = () => {
      const p = props.current;
      const L = layout();
      const key = [w, h, p.quiet, p.asset, p.dir, p.target, p.expiry, Math.round(p.spot * 10), theme].join("|");
      if (key === baseKey) return L;
      baseKey = key;
      C = colors();
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, w, h);
      bctx.font = `500 12px ${MONO}`;
      bctx.textBaseline = "top";
      const lnT = Math.log(p.target);
      const winAbove = p.dir === "above";
      for (let c = 0; c < L.cols; c++) {
        const inCone = c >= L.x0;
        const frac = (c - L.x0) / (L.xE - L.x0);
        const t = Math.max(frac, 0.004) * L.T;
        const after = c > L.xE;
        const sd = L.a.vol * Math.sqrt(after ? L.T : t);
        for (let r = 0; r < L.rows; r++) {
          const ln = L.rowToLn(r + 0.5);
          let d = 0;
          if (inCone) {
            const z = (ln - L.mid + (sd * sd) / 2) / sd;
            // sqrt lifts the tails so the winning zone reads clearly
            d = Math.sqrt(Math.exp((-z * z) / 2));
            if (after) d *= Math.max(0, 1 - (c - L.xE) / (L.cols - L.xE)) * 0.55;
          }
          const n = hash(c, r);
          if (d < 0.12) {
            if (n > 0.965) {
              bctx.fillStyle = C.ink;
              bctx.globalAlpha = 0.18;
              bctx.fillText("·", c * CW, r * CH);
            }
            continue;
          }
          const idx = Math.min(RAMP.length - 1, Math.max(1, Math.floor((d * 0.92 + n * 0.1) * (RAMP.length - 1))));
          const win = !after && (winAbove ? ln >= lnT : ln <= lnT);
          bctx.fillStyle = win ? C.win : C.ink;
          bctx.globalAlpha = win ? 0.55 + 0.45 * d : 0.26 + 0.6 * d;
          bctx.fillText(RAMP[idx], c * CW, r * CH);
        }
      }
      bctx.globalAlpha = 1;
      // fresh sample journeys whenever the setup changes
      pathSeed++;
      paths = Array.from({ length: 5 }, (_, k) => {
        const out: number[] = [];
        let ln = L.mid;
        const steps = L.xE - L.x0;
        const dt = L.T / steps;
        for (let i = 0; i <= steps; i++) {
          out.push(ln);
          const u1 = hash(i, k, pathSeed) || 1e-6;
          const u2 = hash(k, i, pathSeed + 7);
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          ln += -0.5 * L.a.vol * L.a.vol * dt + L.a.vol * Math.sqrt(dt) * z;
        }
        return out;
      });
      return L;
    };

    const pill = (x: number, y: number, text: string, bg: string, fg: string, align: "left" | "center" | "right" = "center") => {
      ctx.font = `600 12px ${SANS}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + 18;
      const ph = 24;
      const px = align === "center" ? x - pw / 2 : align === "right" ? x - pw : x;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(px, y - ph / 2, pw, ph, 12);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textBaseline = "middle";
      ctx.fillText(text, px + 9, y + 0.5);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return; // resumed by the observers below
      if (w < 1 || h < 1 || now - last < 33) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = now;
      const p = props.current;
      const L = buildBase();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 12px ${MONO}`;
      ctx.textBaseline = "top";

      // pointer wake: the field blooms along the cursor's path, like ink in water
      const LIFE = reduced ? 350 : 900;
      if (trail.current.length) {
        const heat = new Map<number, number>();
        for (const pt of trail.current) {
          const age = (now - pt.t) / LIFE;
          if (age >= 1) continue;
          const cc = pt.x / CW;
          const cr = pt.y / CH;
          for (let dc = -5; dc <= 5; dc++) {
            for (let dr = -3; dr <= 3; dr++) {
              const c = Math.round(cc) + dc;
              const r = Math.round(cr) + dr;
              if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) continue;
              const dx = c + 0.5 - cc;
              const dy = r + 0.5 - cr;
              const g = Math.exp(-(dx * dx / 9 + dy * dy / 3.4)) * (1 - age);
              if (g < 0.08) continue;
              const key = r * 4096 + c;
              if ((heat.get(key) ?? 0) < g) heat.set(key, g);
            }
          }
        }
        ctx.font = `600 12px ${MONO}`;
        for (const [key, g] of heat) {
          const c = key % 4096;
          const r = (key - c) / 4096;
          const idx = Math.min(RAMP.length - 1, 2 + Math.floor(g * (RAMP.length - 2) + hash(c, r) * 1.5));
          ctx.fillStyle = C.win;
          ctx.globalAlpha = Math.min(0.95, 0.3 + g * 0.7);
          ctx.fillText(RAMP[idx], c * CW, r * CH);
        }
        ctx.globalAlpha = 1;
        ctx.font = `500 12px ${MONO}`;
        trail.current = trail.current.filter((p) => now - p.t < LIFE);
      }

      // twinkle
      if (!reduced) {
        const tick = Math.floor(now / 180);
        for (let i = 0; i < 90; i++) {
          const c = Math.floor(hash(i, tick) * L.cols);
          const r = Math.floor(hash(tick, i) * L.rows);
          ctx.fillStyle = C.ink;
          ctx.globalAlpha = 0.35;
          ctx.fillText(hash(c, r, tick) > 0.5 ? "+" : "·", c * CW, r * CH);
        }
      }

      const tRow = L.lnToRow(Math.log(p.target));
      const tY = tRow * CH;
      const xE = L.xE * CW;
      const x0 = L.x0 * CW;
      geo.current = {
        rowToPrice: (y: number) => Math.exp(L.rowToLn(y / CH)),
        priceToY: (pr: number) => L.lnToRow(Math.log(pr)) * CH,
        flagX: xE,
      };

      if (!p.quiet) {
      // target line
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = C.text;
      for (let c = L.x0; c <= L.xE; c += 2) ctx.fillText("-", c * CW, tY - CH / 2);
      // expiry rail
      ctx.globalAlpha = 0.45;
      for (let r = Math.floor(L.rTop - 2); r < L.rows; r += 1) ctx.fillText("¦", xE, r * CH);
      ctx.globalAlpha = 1;
      }

      // journeys
      const cycle = reduced ? 1 : ((now / 1000) % 5.2) / 4.2;
      const head = Math.min(1, cycle);
      const steps = L.xE - L.x0;
      ctx.font = `700 13px ${MONO}`;
      paths.forEach((path, k) => {
        const end = path[path.length - 1];
        const win = p.dir === "above" ? end >= Math.log(p.target) : end <= Math.log(p.target);
        const upto = Math.floor(head * steps);
        for (let i = 0; i <= upto; i += 1) {
          const age = upto - i;
          const r = L.lnToRow(path[i]);
          if (r < 0 || r > L.rows) continue;
          ctx.globalAlpha = Math.max(0.12, 1 - age / 26) * (k === 0 ? 1 : 0.75);
          ctx.fillStyle = head >= 1 ? (win ? C.win : C.down) : C.text;
          ctx.fillText(i === upto ? "●" : "•", (L.x0 + i) * CW, r * CH - CH / 2);
        }
      });
      ctx.globalAlpha = 1;

      if (!p.quiet) {
      // today
      const sY = L.lnToRow(Math.log(p.spot)) * CH;
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.arc(x0, sY, 5, 0, Math.PI * 2);
      ctx.fill();
      pill(x0 - 8, sY - 22, `${p.asset} $${Math.round(p.spot).toLocaleString("en-US")}`, C.tile, C.text, "left");

      // flag
      const fx = xE + 4;
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, tY);
      ctx.lineTo(fx, tY - 42);
      ctx.stroke();
      const wave = reduced ? 0 : Math.sin(now / 260) * 3;
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(fx, tY - 42);
      ctx.quadraticCurveTo(fx + 16, tY - 38 + wave, fx + 30, tY - 34);
      ctx.quadraticCurveTo(fx + 16, tY - 30 - wave, fx, tY - 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.arc(fx, tY, 4, 0, Math.PI * 2);
      ctx.fill();
      const right = fx + 140 > w;
      pill(right ? fx - 10 : fx + 38, tY - 34, `$${Math.round(p.target).toLocaleString("en-US")}`, C.accent, C.onAccent, right ? "right" : "left");
      pill(right ? fx - 10 : fx + 38, tY - 6, `${Math.round(p.chance * 100)}% chance`, C.tile, C.text, right ? "right" : "left");
      pill(xE, h - 18, expiryLabel(p.expiry), C.tile, C.text, "center");
      }

      raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      kick();
    });
    io.observe(wrap.current!);
    document.addEventListener("visibilitychange", kick);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      const tr = trail.current;
      const lastPt = tr[tr.length - 1];
      // drop a wake point when the cursor has actually moved a cell or so
      if (!lastPt || Math.abs(x - lastPt.x) + Math.abs(y - lastPt.y) > 6) {
        tr.push({ x, y, t: performance.now() });
        if (tr.length > 36) tr.splice(0, tr.length - 36);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(wrap.current!);
    resize();
    raf = requestAnimationFrame(frame);
    document.fonts?.ready.then(() => (baseKey = ""));
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("pointermove", onMove);
    };
  }, [theme]);

  // drag the flag (or anywhere on the cone) to move your target
  const setFromY = (clientY: number) => {
    const p = props.current;
    if (!p.onTarget) return;
    const r = canvas.current!.getBoundingClientRect();
    const price = geo.current.rowToPrice(clientY - r.top);
    const grid = ASSETS[p.asset].grid;
    const v = Math.max(grid, Math.round(price / grid) * grid);
    if (v !== p.target) p.onTarget(v);
  };

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas
        ref={canvas}
        className={`block touch-none ${onTarget ? "cursor-ns-resize" : ""}`}
        onPointerDown={(e) => {
          if (!onTarget) return;
          const r = canvas.current!.getBoundingClientRect();
          // only react on the plot area, not the headline zone
          if (e.clientY - r.top < r.height * 0.3) return;
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setFromY(e.clientY);
        }}
        onPointerMove={(e) => dragging.current && setFromY(e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        aria-label={`${asset} price cone to ${expiryLabel(expiry)}. Target ${target}. Drag to move your target.`}
        role="img"
      />
    </div>
  );
}
