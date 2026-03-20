from __future__ import annotations

import logging

from groundshift.core.preprocessing.cloud_mask import apply_cloud_mask
from groundshift.core.preprocessing.coregistration import coregister_scenes
from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult
from groundshift.core.preprocessing.normalisation import apply_normalisation

logger = logging.getLogger(__name__)


class PreprocessingService:
    """Run preprocessing pipeline in fixed order: co-registration, cloud mask, normalisation."""

    def run(self, request: PreprocessingRequest) -> PreprocessingResult:
        logger.info("Running preprocessing step: coregistration")
        result = coregister_scenes(request)

        logger.info("Running preprocessing step: cloud_mask")
        result = apply_cloud_mask(result, request)

        if result.reference_masked_path is None or result.target_masked_path is None:
            raise ValueError("Cloud masking must produce reference and target masked paths")

        logger.info("Running preprocessing step: normalisation")
        result = apply_normalisation(result, request)
        return result
