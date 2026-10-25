import { ClipboardCheck, House, type LucideIcon, Scale, Wallet } from 'lucide-react'

export type Path = '/' | '/contas' | '/lancamentos' | '/patrimonio' | '/decisoes' | '/atividade' | '/importar'

export type Screen = { path: Path; title: string; month?: boolean; members?: boolean; tab?: { label: string; Icon: LucideIcon } }

export const screens: Screen[] = [
  { path: '/', title: 'Visão do mês', month: true, members: true, tab: { label: 'Início', Icon: House } },
  { path: '/contas', title: 'Contas do mês', month: true, tab: { label: 'Contas', Icon: ClipboardCheck } },
  { path: '/lancamentos', title: 'Lançamentos', month: true, members: true },
  { path: '/patrimonio', title: 'Dívidas e reservas', tab: { label: 'Reservas', Icon: Wallet } },
  { path: '/decisoes', title: 'Decisões', tab: { label: 'Decisões', Icon: Scale } },
  { path: '/atividade', title: 'Atividade' },
  { path: '/importar', title: 'Importar' },
]

export const tabs: Path[] = ['/', '/contas', '/lancamentos', '/decisoes', '/patrimonio']

export const screenOf = (path: Path) => screens.find((screen) => screen.path === path) ?? (screens[0] as Screen)
