import { toast } from "sonner";
import { Artifact } from "@/components/chat/create-artifact";
import { DownloadIcon } from "@/components/chat/icons";
import { PdfViewer } from "@/components/chat/pdf-viewer";

type PdfArtifactMetadata = {
  // PDF-specific metadata can go here
  pageCount?: number;
  currentPage?: number;
};

export const pdfArtifact = new Artifact<"pdf", PdfArtifactMetadata>({
  kind: "pdf",
  description: "Useful for viewing and analyzing PDF documents.",
  initialize: ({ setMetadata }) => {
    setMetadata({
      pageCount: undefined,
      currentPage: undefined,
    });
  },
  onStreamPart: () => {
    // No special handling for streamed parts
  },
  content: ({ title }) => {
    return (
      <div className="relative min-h-[200px]">
        <PdfViewer title={title} />
      </div>
    );
  },
  actions: [
    {
      icon: <DownloadIcon size={18} />,
      label: "Download",
      description: "Download PDF",
      onClick: () => {
        toast.success("PDF download functionality would be implemented here");
      },
    },
  ],
  toolbar: [],
});
