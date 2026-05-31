import { Aperture, Eye, Grid3X3, Network, Wand2 } from "lucide-react";

const brands = [
  { name: "PIXORA", icon: Aperture },
  { name: "VisionFlow", icon: Eye },
  { name: "Nebula Studio", icon: Grid3X3 },
  { name: "CraftVision", icon: Wand2 },
  { name: "FRAMEWORKS", icon: Network },
];

export function TrustLogos() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-16">
      <div className="border-t border-slate-200 pt-10 text-center">
        <p className="text-sm text-slate-500">被全球创意团队信赖</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-16 gap-y-6 text-slate-400">
          {brands.map((brand) => (
            <div key={brand.name} className="flex items-center gap-2">
              <brand.icon size={18} />
              <span className="text-sm">{brand.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
