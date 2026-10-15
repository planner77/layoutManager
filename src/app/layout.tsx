import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers3, LayoutDashboard, Upload, Network } from 'lucide-react';
import { GlobalLoadingProvider } from '@/components/global-loading';
import packageInfo from '../package.json';
import './globals.css';
export const metadata: Metadata = { title: 'CAD Layout Manager', description: '공장·설비 도면 관리 및 DXF Viewer 비교' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body><GlobalLoadingProvider><header className="flex min-h-17 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-8"><Link href="/" className="flex items-center gap-3"><span className="rounded-xl bg-teal-700 p-2 text-white"><Layers3 size={22}/></span><span className="text-lg tracking-tight text-slate-500">Layout Manager</span></Link><nav className="flex flex-wrap gap-4 text-sm text-slate-600"><Link className="flex min-h-11 items-center gap-2" href="/"><LayoutDashboard size={16}/>도면 목록</Link><Link className="flex min-h-11 items-center gap-2" href="/masters"><Network size={16}/>기준정보</Link><Link className="flex min-h-11 items-center gap-2" href="/cad/upload"><Upload size={16}/>파일 등록</Link><span className="flex items-center text-slate-400">v{packageInfo.version}</span></nav></header><main className="mx-auto max-w-[1600px] p-4 sm:p-8">{children}</main></GlobalLoadingProvider></body></html>; }
