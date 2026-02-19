"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface ShareButtonProps {
  title?: string;
  className?: string;
}

export function ShareButton({ title, className }: ShareButtonProps) {
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const pathname = usePathname();
  const { toast } = useToast();

  const handleShare = async () => {
    const url = `${window.location.origin}${pathname}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      toast({ title: tCommon("share"), description: tCommon("linkCopied") });
    } catch {
      toast({
        title: tErrors("generic"),
        description: tCommon("shareFailed"),
        variant: "destructive",
      });
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare} className={className}>
      <Share2 className="h-4 w-4 mr-2" />
      {tCommon("share")}
    </Button>
  );
}

