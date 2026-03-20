from __future__ import annotations

import numpy as np

from groundshift.core.detection.base import BaseDetector


class SpectralDetector(BaseDetector):
    RED_BAND_INDEX = 3  # Sentinel-2 B04, 665nm
    NIR_BAND_INDEX = 7  # Sentinel-2 B08, 842nm

    def detect(
        self,
        reference: np.ndarray,
        target: np.ndarray,
    ) -> np.ndarray:
        red_ref = reference[self.RED_BAND_INDEX]
        nir_ref = reference[self.NIR_BAND_INDEX]
        red_target = target[self.RED_BAND_INDEX]
        nir_target = target[self.NIR_BAND_INDEX]

        denominator_ref = nir_ref + red_ref
        ndvi_ref = np.where(
            denominator_ref != 0,
            (nir_ref - red_ref) / denominator_ref,
            0.0,
        )

        denominator_target = nir_target + red_target
        ndvi_target = np.where(
            denominator_target != 0,
            (nir_target - red_target) / denominator_target,
            0.0,
        )

        change_score = np.abs(ndvi_target - ndvi_ref)

        change_score = np.clip(change_score, 0.0, 1.0)

        cloud_masked_pixels = (
            (red_ref == 0)
            & (nir_ref == 0)
            & (red_target == 0)
            & (nir_target == 0)
        )
        change_score[cloud_masked_pixels] = 0.0

        return change_score.astype(np.float32, copy=False)
