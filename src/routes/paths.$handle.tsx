import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { OurPathsView, type OurPathsData } from "@/components/social/OurPathsView";
import { OurPathsShareDialog } from "@/components/social/OurPathsShareDialog";
import type { PathDiscovery } from "@/components/social/SocialVisuals";
import {
  getOurPaths,
  getOurPathsShareData,
  proposeSharedMoment,
  setPairPermission,
} from "@/server/social";

export const Route = createFileRoute("/paths/$handle")({ component: OurPathsRoute });

function OurPathsRoute() {
  const { handle } = Route.useParams();
  const loadPaths = useServerFn(getOurPaths);
  const updatePermission = useServerFn(setPairPermission);
  const proposeMoment = useServerFn(proposeSharedMoment);
  const loadShareData = useServerFn(getOurPathsShareData);
  const [data, setData] = useState<OurPathsData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sharePreview, setSharePreview] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [additionalHandle, setAdditionalHandle] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(
        (await loadPaths({
          data: { handle, additionalHandle: additionalHandle ?? undefined },
        })) as OurPathsData,
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Our Paths is not available.");
    }
  }, [additionalHandle, handle, loadPaths]);
  useEffect(() => {
    void load();
    const revalidate = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 2_500);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(timer);
    };
  }, [load]);
  async function permission(kind: "EXTERNAL_SHARE", allowed: boolean) {
    try {
      await updatePermission({ data: { handle, permission: kind, allowed } });
      setMessage(allowed ? "Permission updated." : "Permission revoked immediately.");
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Permission could not be updated.");
    }
  }
  async function confirmMoment(discovery: PathDiscovery) {
    try {
      await proposeMoment({
        data: {
          handle,
          city: discovery.city,
          yearFrom: discovery.overlapFrom,
          yearTo: discovery.overlapTo,
        },
      });
      setMessage(
        `${data?.other.displayName || "Your connection"} can now confirm this shared moment.`,
      );
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Shared moment unavailable.");
    }
  }
  async function sharePaths() {
    try {
      setSharePreview("");
      setShareOpen(true);
      const payload = await loadShareData({ data: { handle } });
      const { renderOurPathsCard } = await import("@/lib/share-card");
      setSharePreview(await renderOurPathsCard(payload));
    } catch (reason) {
      setShareOpen(false);
      setMessage(reason instanceof Error ? reason.message : "Our Paths sharing is not available.");
    }
  }
  if (error)
    return (
      <main className="paths-error">
        <LockKeyhole />
        <h1>Our Paths remains private.</h1>
        <p>{error}</p>
        <Link to="/circle">
          <ArrowLeft />
          Return to Life Circle
        </Link>
      </main>
    );
  if (!data) return <div className="social-loading">Finding where two stories overlap…</div>;
  return (
    <>
      <OurPathsView
        data={data}
        onPermission={(kind, allowed) => void permission(kind, allowed)}
        onConfirmMoment={(discovery) => void confirmMoment(discovery)}
        onShare={() => void sharePaths()}
        onAdditionalFriend={setAdditionalHandle}
      />
      <OurPathsShareDialog open={shareOpen} onOpenChange={setShareOpen} preview={sharePreview} />
      {message && (
        <div className="circle-toast" role="status">
          {message}
        </div>
      )}
    </>
  );
}
