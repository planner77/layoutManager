import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers3, LayoutDashboard, Upload } from 'lucide-react';
import packageInfo from '../package.json';
import './globals.css';
export const metadata: Metadata = { title: 'CAD Layout Manager', description: '공장·설비 도면 관리 및 DXF Viewer 비교' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body><header className="flex h-17 items-center justify-between border-b border-slate-200 bg-white px-8"><Link href="/" className="flex items-center gap-3"><span className="rounded-xl bg-teal-700 p-2 text-white"><Layers3 size={22}/></span><span className="text-lg font-bold tracking-tight">CAD <span className="font-normal text-slate-500">Layout Manager</span></span><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">P.O.C.</span></Link><nav className="flex gap-6 text-sm text-slate-600"><Link className="flex items-center gap-2" href="/"><LayoutDashboard size={16}/>도면 목록</Link><Link className="flex items-center gap-2" href="/cad/upload"><Upload size={16}/>파일 등록</Link><span className="text-slate-400">v{packageInfo.version}</span></nav></header><main className="mx-auto max-w-[1600px] p-8">{children}</main></body></html>; }
