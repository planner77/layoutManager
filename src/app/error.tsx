'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div role="alert" className="rounded-xl border border-red-100 bg-white p-10 text-center"><h2 className="font-semibold">도면 정보를 불러오지 못했습니다.</h2><p className="mt-2 text-sm text-slate-500">잠시 후 다시 시도해주세요.</p><Button onClick={reset} className="mt-5">다시 시도</Button></div>; }
