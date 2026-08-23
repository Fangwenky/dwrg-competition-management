import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() { return <div className="page-wrap"><EmptyState title="档案不存在或尚未公开" description="请检查地址，或返回赛事档案查找已发布内容。" action={<Link className="button-primary" href="/events">返回赛事档案</Link>} /></div>; }
