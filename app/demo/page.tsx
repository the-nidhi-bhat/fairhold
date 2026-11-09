import type { Metadata } from "next";
import { DemoExperience } from "@/components/demo-experience";

export const metadata: Metadata = {
  title: "Guided demo",
  description:
    "Run the FairHold milestone lifecycle in your browser: simulated authorization hold, evidence, human approval and a clearly labelled simulated capture. No PayPal request is made.",
};

export default function DemoPage() {
  return (
    <>
      <DemoExperience />
      <noscript>
        <div className="page-frame py-10">
          <p className="surface p-6 text-sm text-muted">
            The guided demo runs in your browser and needs JavaScript. The product
            overview and documentation are still available without it.
          </p>
        </div>
      </noscript>
    </>
  );
}
