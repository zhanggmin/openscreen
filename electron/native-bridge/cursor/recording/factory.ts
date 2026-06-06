import type { Rectangle } from "electron";
import { MacNativeCursorRecordingSession } from "./macNativeCursorRecordingSession";
import type { CursorRecordingSession } from "./session";
import { TelemetryRecordingSession } from "./telemetryRecordingSession";
import {
	findCursorSamplerPath,
	WindowsNativeRecordingSession,
} from "./windowsNativeRecordingSession";

interface CreateCursorRecordingSessionOptions {
	getDisplayBounds: () => Rectangle | null;
	maxSamples: number;
	platform: NodeJS.Platform;
	sampleIntervalMs: number;
	sourceId?: string | null;
	startTimeMs?: number;
}

export function createCursorRecordingSession(
	options: CreateCursorRecordingSessionOptions,
): CursorRecordingSession {
	if (options.platform === "win32") {
		const helperPath = findCursorSamplerPath();
		if (helperPath) {
			return new WindowsNativeRecordingSession({
				getDisplayBounds: options.getDisplayBounds,
				maxSamples: options.maxSamples,
				sampleIntervalMs: options.sampleIntervalMs,
				sourceId: options.sourceId,
				startTimeMs: options.startTimeMs,
			});
		}
		// Fallback: cursor-sampler.exe not built; use Electron screen API telemetry instead.
		console.warn(
			"[cursor] cursor-sampler.exe not found, falling back to TelemetryRecordingSession",
		);
		return new TelemetryRecordingSession({
			getDisplayBounds: options.getDisplayBounds,
			maxSamples: options.maxSamples,
			sampleIntervalMs: options.sampleIntervalMs,
			startTimeMs: options.startTimeMs,
		});
	}

	if (options.platform === "darwin") {
		return new MacNativeCursorRecordingSession({
			getDisplayBounds: options.getDisplayBounds,
			maxSamples: options.maxSamples,
			sampleIntervalMs: options.sampleIntervalMs,
			startTimeMs: options.startTimeMs,
		});
	}

	// Linux: capture cursor positions via Electron's `screen` API on an interval.
	// No cursor sprites/assets and no clicks, just position telemetry.
	return new TelemetryRecordingSession({
		getDisplayBounds: options.getDisplayBounds,
		maxSamples: options.maxSamples,
		sampleIntervalMs: options.sampleIntervalMs,
		startTimeMs: options.startTimeMs,
	});
}
