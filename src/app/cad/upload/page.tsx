import { UploadForm } from '@/features/cad-upload/upload-form';
export const dynamic = 'force-dynamic';
export default function Page() { const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return <UploadForm today={today} maxMb={Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100)}/>; }
