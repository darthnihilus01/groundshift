"""Preprocessing pipeline for scene alignment, cloud masking, and normalisation."""

from groundshift.core.preprocessing.cloud_mask import apply_cloud_mask
from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult

__all__ = ["PreprocessingRequest", "PreprocessingResult", "apply_cloud_mask"]
