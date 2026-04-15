/**
 * Aurora Cloud Functions — Entry Point
 *
 * Re-exports all Cloud Function handlers from their dedicated modules.
 * Firebase CLI discovers exported functions from this file.
 */

export { calculateTrajectoryDeltas } from './trajectory-calculator'
