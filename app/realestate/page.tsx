import { Suspense } from "react";
import RealEstateView from "@/components/RealEstateView";
export const metadata = { title: "不動産用語辞典" };
export default function Page() { return <Suspense><RealEstateView /></Suspense>; }
