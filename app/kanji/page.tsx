import { Suspense } from "react";
import KanjiView from "@/components/KanjiView";
export const metadata = { title: "漢字検索" };
export default function Page() { return <Suspense><KanjiView /></Suspense>; }
