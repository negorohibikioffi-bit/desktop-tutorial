import { Suspense } from "react";
import KoreanView from "@/components/KoreanView";
export const metadata = { title: "韓国語" };
export default function Page() { return <Suspense><KoreanView /></Suspense>; }
