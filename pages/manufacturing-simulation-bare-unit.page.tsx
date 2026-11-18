import { ManufacturingSimulationViewer } from "lib/viewer/manufacturing-simulation-viewer"

/**
 * Second line on the same unit 322 floor: the bare unit (no motor). Boards are
 * tested beside the QC test motor, then bagged by hand in an 80 x 120 mm ESD
 * bag with a screw pouch, the spacer and the motor cable, and shipped to
 * Amazon FBA. Named after the main simulation so Cosmos lists it second.
 */
export default () => <ManufacturingSimulationViewer productLine="bagged" />
