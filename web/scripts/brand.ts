import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { type Direction, directions, type Palette } from './brand-directions.ts'
import { publicDir } from './icons.ts'

export const brandDir = join(publicDir, '..', '..', 'docs', 'brand')

const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)

const luminance = (hex: string) => {
  const part = (start: number) => channel(Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  return 0.2126 * part(1) + 0.7152 * part(3) + 0.0722 * part(5)
}

export const contrast = (a: string, b: string) => {
  const high = Math.max(luminance(a), luminance(b))
  const low = Math.min(luminance(a), luminance(b))
  return (high + 0.05) / (low + 0.05)
}

export const pairs: [keyof Palette, keyof Palette][] = [
  ['text', 'surface'],
  ['text', 'bg'],
  ['muted', 'surface'],
  ['muted', 'bg'],
  ['accent', 'surface'],
  ['income', 'surface'],
  ['expense', 'surface'],
  ['late', 'surface'],
  ['accent-text', 'accent'],
]

export const themes = ['light', 'dark'] as const
export const widths = [390, 1440] as const

export const shots = [...directions.flatMap((direction) => widths.flatMap((width) => themes.map((theme) => `${direction.id}-overview-${width}-${theme}.png`))), ...themes.map((theme) => `board-1440-${theme}.png`), 'board-390-light.png']

const fonts = ['geist-latin-wght-normal.woff2', 'geist-mono-latin-wght-normal.woff2']

const vars = (palette: Palette) =>
  Object.entries(palette)
    .map(([name, value]) => `--${name}:${value}`)
    .join(';')

const themed = (light: Palette, dark: Palette) => `:root{${vars(light)};color-scheme:light}@media (prefers-color-scheme:dark){:root{${vars(dark)};color-scheme:dark}}`

const base = (prefix: string) =>
  `@font-face{font-family:Geist;src:url(${prefix}fonts/${fonts[0]}) format('woff2');font-weight:100 900}@font-face{font-family:'Geist Mono';src:url(${prefix}fonts/${fonts[1]}) format('woff2');font-weight:100 900}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 Geist,system-ui,sans-serif}h1,h2,h3,p{margin:0}a{color:var(--accent)}.num{font-family:'Geist Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.card{background:var(--surface);border:1px solid var(--border);border-radius:14px}`

const html = (title: string, style: string, body: string) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${style}</style>
</head>
<body>
${body}
</body>
</html>
`

export const markSvg = (direction: Direction, color = 'currentColor') => `${direction.mark(color, 512).replace('<svg ', `<svg role="img" aria-label="${direction.names[0]?.name}" `)}\n`

export const wordmarkSvg = (direction: Direction, color: string) => {
  const name = direction.names[0]?.name ?? ''
  const width = 132 + name.length * 34
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 96" width="${width}" height="96" role="img" aria-label="${name}"><g transform="translate(8 8) scale(0.15625)">${direction.mark(color, 512).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="100" y="64" font-family="Geist, system-ui, sans-serif" font-size="52" font-weight="600" letter-spacing="-1.5" fill="${color}">${name}</text></svg>\n`
}

export const iconSvg = (direction: Direction, maskable: boolean) => {
  const scale = maskable ? 0.6 : 0.78
  const offset = (512 * (1 - scale)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>${direction.names[0]?.name}</title><rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="${direction.light.accent}"/><g transform="translate(${offset.toFixed(1)} ${offset.toFixed(1)}) scale(${scale})">${direction.mark(direction.light['accent-text'], 512).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>\n`
}

const due = [
  { name: 'Plano de saúde', meta: 'Atrasada · venceu 15/10', amount: 'R$ 750,00', late: true },
  { name: 'Fatura do cartão', meta: 'Vence em 5 dias · 25/10', amount: 'R$ 2.418,50', late: false },
  { name: 'Escola', meta: 'Vence em 8 dias · 28/10', amount: 'R$ 1.650,00', late: false },
]

const categories = [
  ['Moradia', 'R$ 5.200,00', 100],
  ['Alimentação', 'R$ 2.986,40', 57],
  ['Dívidas', 'R$ 2.000,00', 38],
  ['Educação', 'R$ 1.650,00', 32],
] as const

const months = [
  ['mai', 92, 64],
  ['jun', 92, 70],
  ['jul', 96, 82],
  ['ago', 92, 61],
  ['set', 100, 75],
  ['out', 100, 71],
] as const

const nav = [
  ['Início', '/'],
  ['Contas', '/contas'],
  ['Lançamentos', '/lancamentos'],
  ['Decisões', '/decisoes'],
  ['Reservas', '/patrimonio'],
  ['Atividade', '/atividade'],
] as const

const overviewStyle = `.app{display:flex;min-height:100vh}.side{display:none}.main{flex:1;padding:20px 16px 96px;display:flex;flex-direction:column;gap:16px;max-width:1180px}.top{display:flex;align-items:center;gap:8px}.top h1{margin:0 auto;font-size:17px;font-weight:600}.step{width:44px;height:44px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:18px}.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:18px;letter-spacing:-0.02em;color:var(--text)}.brand svg{width:28px;height:28px;color:var(--accent)}.mobile-brand{display:flex}.hero{padding:18px;border-radius:16px;display:flex;flex-direction:column;gap:6px}.label{font-size:13px;color:var(--muted)}.big{font-size:32px;font-weight:500;letter-spacing:-0.02em}.bar{height:8px;border-radius:999px;background:var(--sunken);overflow:hidden;display:flex;margin-top:8px}.legend{display:flex;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.stat{padding:12px;border-radius:12px;display:flex;flex-direction:column;gap:4px}.stat .num{font-size:14px}.stat.wide{display:none}.grid{display:flex;flex-direction:column;gap:16px}section{display:flex;flex-direction:column;gap:8px}h2{font-size:15px;font-weight:600}.head{display:flex;align-items:baseline}.head a{margin-left:auto;font-size:13px;text-decoration:none}.row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px}.row div{display:flex;flex-direction:column;gap:2px}.row b{font-weight:500}.row small{font-size:12px;color:var(--muted)}.row small.late{color:var(--late)}.row .num{margin-left:auto}.cat{display:flex;flex-direction:column;gap:6px}.cat p{display:flex;font-size:13px}.cat p span:last-child{margin-left:auto}.track{height:6px;border-radius:999px;background:var(--sunken);overflow:hidden}.track i{display:block;height:100%;background:var(--expense)}.chart{display:none}.tabs{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:8px 8px 20px;background:var(--surface);border-top:1px solid var(--border)}.tabs a{min-height:48px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);text-decoration:none}.tabs a[aria-current]{color:var(--accent);font-weight:600}.tabs .plus span{width:52px;height:52px;border-radius:16px;background:var(--accent);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-size:26px}
@media (min-width:768px){.side{display:flex;flex-direction:column;gap:20px;width:240px;flex:none;padding:24px 16px;background:var(--surface);border-right:1px solid var(--border)}.side nav{display:flex;flex-direction:column;gap:2px}.side nav a{padding:10px 12px;border-radius:10px;color:var(--muted);text-decoration:none}.side nav a[aria-current]{background:var(--sunken);color:var(--accent);font-weight:600}.mobile-brand,.tabs{display:none}.main{padding:28px 32px;gap:20px}.top h1{margin:0;font-size:26px;letter-spacing:-0.02em}.top .step:first-of-type{margin-left:auto}.kpis{display:grid;grid-template-columns:2fr repeat(3,minmax(0,1fr));gap:16px}.hero{padding:20px 24px;border-radius:14px}.stats{display:contents}.stat{padding:20px 24px;border-radius:14px;justify-content:space-between}.stat .num{font-size:26px;font-weight:500}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.grid>section{padding:20px 24px;border-radius:14px;background:var(--surface);border:1px solid var(--border)}.grid .row{border:0;padding:10px 0;border-radius:0;border-bottom:1px solid var(--border)}.chart{display:flex;grid-column:1/-1}.cols{display:flex;align-items:flex-end;gap:28px;height:160px;padding-top:8px}.cols div{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}.cols span.pair{display:flex;gap:4px;align-items:flex-end;height:100%}.cols i{width:18px;border-radius:4px 4px 0 0}.cols small{font-size:12px;color:var(--muted)}.keys{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-left:auto}.keys b{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}}`

export const overview = (direction: Direction) => {
  const name = direction.names[0]?.name ?? ''
  const mark = direction.mark('currentColor', 28).replace('<svg ', '<svg aria-hidden="true" ')
  const brand = `<span class="brand">${mark}<span>${name}</span></span>`
  const rows = due.map((item) => `<div class="row card"><div><b>${item.name}</b><small${item.late ? ' class="late"' : ''}>${item.meta}</small></div><span class="num">${item.amount}</span></div>`).join('')
  const cats = categories.map(([label, amount, width]) => `<div class="cat"><p><span>${label}</span><span class="num">${amount}</span></p><div class="track"><i style="width:${width}%"></i></div></div>`).join('')
  const cols = months.map(([month, income, expense]) => `<div><span class="pair"><i style="height:${income}%;background:var(--income)"></i><i style="height:${expense}%;background:var(--expense)"></i></span><small>${month}</small></div>`).join('')
  const body = `<div class="app">
<aside class="side">${brand}<nav aria-label="Principal">${nav.map(([item, path], index) => `<a href="${path}"${index === 0 ? ' aria-current="page"' : ''}>${item}</a>`).join('')}</nav></aside>
<main class="main">
<div class="mobile-brand">${brand}</div>
<header class="top"><h1>Outubro de 2026</h1><button class="step" type="button" aria-label="Mês anterior">‹</button><button class="step" type="button" aria-label="Próximo mês">›</button></header>
<div class="kpis">
<section class="hero card" aria-label="Saldo previsto"><span class="label">Saldo previsto</span><span class="num big">R$ 6.326,60</span><div class="bar" role="img" aria-label="Despesas são 71% das receitas: 50% pagas, 18% pendentes, 3% atrasadas"><i style="width:50%;background:var(--expense)"></i><i style="width:18%;background:color-mix(in srgb,var(--expense) 40%,var(--sunken))"></i><i style="width:3%;background:var(--late)"></i></div><div class="legend"><span>Pago 50%</span><span>Pendente 18%</span><span style="color:var(--late)">Atrasado 3%</span><span style="margin-left:auto">das receitas</span></div></section>
<div class="stats"><div class="stat card"><span class="label">Recebido</span><span class="num" style="color:var(--income)">22.200,00</span></div><div class="stat card"><span class="label">Pago</span><span class="num">11.204,90</span></div><div class="stat card"><span class="label">Em aberto</span><span class="num" style="color:var(--late)">4.668,50</span></div></div>
</div>
<div class="grid">
<section class="chart" aria-labelledby="flow"><div class="head"><h2 id="flow">Receitas e despesas</h2><span class="keys"><span><b style="background:var(--income)"></b>Receitas</span><span><b style="background:var(--expense)"></b>Despesas</span></span></div><div class="cols" role="img" aria-label="Receitas acima das despesas nos últimos seis meses">${cols}</div></section>
<section aria-labelledby="due"><div class="head"><h2 id="due">Para pagar</h2><a href="/contas">Ver todas</a></div>${rows}</section>
<section aria-labelledby="cat"><h2 id="cat">Onde foi o dinheiro</h2>${cats}</section>
</div>
</main>
<nav class="tabs" aria-label="Principal"><a href="/" aria-current="page">Início</a><a href="/contas">Contas</a><a class="plus" href="/lancamentos" aria-label="Novo lançamento"><span>+</span></a><a href="/decisoes">Decisões</a><a href="/patrimonio">Reservas</a></nav>
</div>`
  return html(`${name} · Visão do mês`, base('../') + themed(direction.light, direction.dark) + overviewStyle, body)
}

const swatches = (direction: Direction) =>
  themes
    .map((theme) => {
      const palette = direction[theme]
      const items = (['bg', 'surface', 'text', 'muted', 'accent', 'income', 'expense', 'late'] as const).map((token) => `<li><b style="background:${palette[token]}"></b><span>${token}</span><code>${palette[token]}</code></li>`).join('')
      const lowest = Math.min(...pairs.map(([fg, bg]) => contrast(palette[fg], palette[bg])))
      return `<div><h4>${theme === 'light' ? 'Light' : 'Dark'} · lowest contrast ${lowest.toFixed(1)}:1</h4><ul class="swatches">${items}</ul></div>`
    })
    .join('')

const column = (direction: Direction) => `<article class="card direction" aria-labelledby="${direction.id}">
<header><h2 id="${direction.id}">${direction.title}</h2><p>${direction.idea}</p><p class="says">${direction.says}</p></header>
<div class="marks"><span class="tile" style="background:${direction.light.surface};color:${direction.light.accent}">${direction.mark('currentColor', 72).replace('<svg ', '<svg aria-hidden="true" ')}</span><span class="tile" style="background:${direction.dark.surface};color:${direction.dark.accent}">${direction.mark('currentColor', 72).replace('<svg ', '<svg aria-hidden="true" ')}</span><img src="${direction.id}/icon-512.png" alt="App icon ${direction.names[0]?.name}" width="72" height="72"><img src="${direction.id}/icon-maskable-512.png" alt="Maskable icon ${direction.names[0]?.name}" width="72" height="72" class="round"></div>
<img class="wordmark" src="${direction.id}/wordmark.svg" alt="Wordmark ${direction.names[0]?.name}" height="48">
<h3>Names</h3>
<ol class="names">${direction.names.map((candidate) => `<li><b>${candidate.name}</b><span>${candidate.reason}</span><small>Risk: ${candidate.risk}</small></li>`).join('')}</ol>
<h3>Palette</h3>
<div class="palettes">${swatches(direction)}</div>
<h3>Type</h3>
<p>${direction.font}</p>
<h3>Visão do mês redrawn</h3>
<div class="shots"><a href="${direction.id}/overview.html"><img src="screenshots/${direction.id}-overview-390-light.png" alt="Visão do mês ${direction.title} at 390, light" width="130"></a><a href="${direction.id}/overview.html"><img src="screenshots/${direction.id}-overview-390-dark.png" alt="Visão do mês ${direction.title} at 390, dark" width="130"></a></div>
<p><a href="${direction.id}/overview.html">Open the page</a> · <a href="screenshots/${direction.id}-overview-1440-light.png">1440 light</a> · <a href="screenshots/${direction.id}-overview-1440-dark.png">1440 dark</a></p>
</article>`

const boardStyle = `main{max-width:1400px;margin:0 auto;padding:32px 16px;display:flex;flex-direction:column;gap:24px}.intro{display:flex;flex-direction:column;gap:8px;max-width:760px}.intro h1{font-size:26px;font-weight:600;letter-spacing:-0.02em}.intro p{color:var(--muted)}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}.direction{padding:20px 24px;display:flex;flex-direction:column;gap:12px}.direction h2{font-size:22px;font-weight:600;letter-spacing:-0.02em}.direction header{display:flex;flex-direction:column;gap:6px}.says{color:var(--muted)}h3{font-size:15px;font-weight:600;margin-top:8px}h4{font-size:12px;font-weight:500;color:var(--muted);margin:0 0 6px}.marks{display:flex;gap:10px;flex-wrap:wrap}.tile{width:72px;height:72px;border-radius:16px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center}.tile svg{width:56px;height:56px}.round{border-radius:50%}.wordmark{align-self:flex-start;padding:8px 12px;background:#FFFFFF;border-radius:10px;border:1px solid var(--border)}.names{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px}.names li{display:flex;flex-direction:column;gap:2px}.names small{color:var(--muted);font-size:12px}.palettes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.swatches{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}.swatches li{display:flex;align-items:center;gap:6px}.swatches b{width:16px;height:16px;border-radius:4px;border:1px solid var(--border)}.swatches code{margin-left:auto;font-family:'Geist Mono',monospace;color:var(--muted)}.shots{display:flex;gap:10px}.shots img{border-radius:10px;border:1px solid var(--border);display:block}.checks{padding:20px 24px;display:flex;flex-direction:column;gap:8px}.checks ul{margin:0;padding-left:20px}`

const current: Palette = { bg: '#F6F6F3', surface: '#FFFFFF', sunken: '#F0F0EC', border: '#E3E3DD', text: '#15171C', muted: '#5B606B', accent: '#2B54D9', 'accent-text': '#FFFFFF', income: '#2B54D9', expense: '#B4440E', late: '#9A3A0B' }
const currentDark: Palette = { bg: '#0E1014', surface: '#161920', sunken: '#1E222A', border: '#2A2E37', text: '#ECEDEF', muted: '#A0A6B1', accent: '#8BA6FF', 'accent-text': '#0E1014', income: '#8BA6FF', expense: '#F08A4B', late: '#F5A574' }

export const board = () => {
  const body = `<main>
<header class="intro"><h1>Commercial identity: three directions</h1><p>A study to replace "Caixa", which collides with Caixa Econômica Federal, and "Finanças", too generic to register. Nothing here is applied to the app. Audience, message and criteria are in <a href="brief.md">brief.md</a>. The first name of each direction is the one drawn; app copy stays in Portuguese.</p></header>
<div class="columns">${directions.map(column).join('\n')}</div>
<section class="card checks" aria-labelledby="checks"><h2 id="checks">Checks the agent cannot run (for the author)</h2><ul><li>INPI: trademark search in classes 36 (financial services), 9 (software) and 42 (SaaS) for every name</li><li>registro.br: availability of the .com.br and .app.br domains</li><li>App stores and social networks: name and handle free</li><li>Read aloud by people outside the family, in Portuguese and in English</li></ul></section>
</main>`
  return html('Commercial identity · directions', base('') + themed(current, currentDark) + boardStyle, body)
}

export const files = () => {
  const out: Record<string, string> = { 'index.html': board() }
  for (const direction of directions) {
    out[`${direction.id}/mark.svg`] = markSvg(direction)
    out[`${direction.id}/wordmark.svg`] = wordmarkSvg(direction, direction.light.text)
    out[`${direction.id}/wordmark-dark.svg`] = wordmarkSvg(direction, direction.dark.text)
    out[`${direction.id}/icon.svg`] = iconSvg(direction, false)
    out[`${direction.id}/icon-maskable.svg`] = iconSvg(direction, true)
    out[`${direction.id}/overview.html`] = overview(direction)
  }
  return out
}

export const icons = (direction: Direction) => [
  { file: `${direction.id}/icon-512.png`, svg: iconSvg(direction, false) },
  { file: `${direction.id}/icon-maskable-512.png`, svg: iconSvg(direction, true) },
]

const render = async () => {
  const font = (name: string) => new URL(import.meta.resolve(`@fontsource-variable/${name.startsWith('geist-mono') ? 'geist-mono' : 'geist'}/files/${name}`))
  await mkdir(join(brandDir, 'fonts'), { recursive: true })
  await mkdir(join(brandDir, 'screenshots'), { recursive: true })
  for (const name of fonts) await copyFile(font(name), join(brandDir, 'fonts', name))
  await copyFile(new URL(import.meta.resolve('@fontsource-variable/geist/LICENSE')), join(brandDir, 'fonts', 'LICENSE'))
  for (const [path, content] of Object.entries(files())) {
    await mkdir(join(brandDir, path, '..'), { recursive: true })
    await writeFile(join(brandDir, path), content)
  }
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' })
  for (const direction of directions) {
    for (const icon of icons(direction)) {
      const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
      await page.setContent(`<style>*{margin:0}svg{display:block;width:100vw;height:100vh}</style>${icon.svg}`)
      await page.screenshot({ path: join(brandDir, icon.file), omitBackground: true })
      await page.close()
    }
  }
  const shoot = async (path: string, file: string, width: number, theme: 'light' | 'dark') => {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await page.goto(`file://${join(brandDir, path)}`)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(brandDir, 'screenshots', file), fullPage: path === 'index.html' })
    await page.close()
  }
  for (const direction of directions) for (const width of widths) for (const theme of themes) await shoot(`${direction.id}/overview.html`, `${direction.id}-overview-${width}-${theme}.png`, width, theme)
  for (const theme of themes) await shoot('index.html', `board-1440-${theme}.png`, 1440, theme)
  await shoot('index.html', 'board-390-light.png', 390, 'light')
  await browser.close()
}

if (import.meta.main) await render()
