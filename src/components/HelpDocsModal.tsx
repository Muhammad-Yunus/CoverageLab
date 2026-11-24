import React from 'react';
import { BookOpen, FileText, X } from 'lucide-react';

interface HelpDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportPdf: () => void;
}

export const HelpDocsModal: React.FC<HelpDocsModalProps> = ({
  isOpen,
  onClose,
  onExportPdf,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="CoverageLab RF Engineering Reference"
    >
      <div className="bg-[#2b2f34] text-slate-100 rounded-md shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 bg-[#23272b]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold">CoverageLab RF Propagation &amp; Operations Guide</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close documentation modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto cl-scroll space-y-4 text-sm text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded bg-[#23272b] border border-slate-700 space-y-1.5">
            <h3 className="font-semibold text-white">1. RF Propagation Physics Engine</h3>
            <p className="text-xs">
              CoverageLab computes point-to-area coverage heatmaps and point-to-point Fresnel link
              budgets using Free-Space Path Loss (FSPL), knife-edge Fresnel zone diffraction
              (4/3 effective Earth curvature), 3D antenna azimuth/elevation pattern gain
              interpolation, Johnson-Nyquist thermal noise floor, and environmental land-cover /
              building clutter attenuation.
            </p>
          </div>

          <div className="p-3.5 rounded bg-[#23272b] border border-slate-700 space-y-1.5">
            <h3 className="font-semibold text-white">2. Interactive Map Workbench Tools</h3>
            <ul className="text-xs space-y-1 list-disc pl-4">
              <li>
                <strong>Drag Tx / Rx Pins:</strong> Drag the orange Tx or black Rx marker directly
                on Google Maps to update coordinates and recalculate link budgets.
              </li>
              <li>
                <strong>Ruler / Path Profile (Top Bar):</strong> Opens the terrain, building, trees,
                1st Fresnel zone, and LOS profile chart between Tx and Rx.
              </li>
              <li>
                <strong>Multipoint Analysis Tool:</strong> Click locations on the map to evaluate
                links from multiple transmitters back to the Rx receiver.
              </li>
              <li>
                <strong>Mesh / MANET Tool:</strong> Place and inspect 923 MHz / ISM mesh nodes and
                inter-node RF links.
              </li>
              <li>
                <strong>Clutter Manager:</strong> Customize Land Cover attenuation (Water, Trees,
                Urban, etc.) and place custom Obstacle blocks directly onto the map.
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              All configurations and simulations persist in PostgreSQL via Drizzle ORM.
            </span>
            <button
              type="button"
              onClick={() => {
                onExportPdf();
                onClose();
              }}
              className="px-3.5 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Export PDF Analysis Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
