"""
Utilities for anomaly detection: math, normalization, thresholds.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def normalize_ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Compute Normalized Difference Vegetation Index.

    Args:
        red: Red band (Sentinel-2 B04).
        nir: NIR band (Sentinel-2 B08).

    Returns:
        NDVI in [-1, 1], with division by zero handled.
    """
    denom = nir.astype(np.float32) + red.astype(np.float32)
    ndvi = np.where(
        np.abs(denom) > 1e-6,
        (nir.astype(np.float32) - red.astype(np.float32)) / denom,
        0.0,
    )
    return np.clip(ndvi, -1.0, 1.0)


def z_score(value: float, mean: float, std: float, epsilon: float = 1e-6) -> float:
    """
    Compute standardized score.

    Args:
        value: observation.
        mean: population mean.
        std: population standard deviation.
        epsilon: prevent division by zero.

    Returns:
        Z-score ((value - mean) / std).
    """
    return (value - mean) / (std + epsilon)


def confidence_from_zscore(z: float, threshold: float = 2.0) -> float:
    """
    Convert z-score to confidence [0, 1].

    At z = threshold, confidence = 1.0.
    At z = 0, confidence = 0.0.

    Args:
        z: z-score.
        threshold: z-score considered "fully anomalous".

    Returns:
        Confidence [0, 1].
    """
    if threshold <= 0:
        threshold = 1.0
    return min(1.0, abs(z) / threshold)


def percentile_rank(value: float, population: np.ndarray) -> float:
    """
    Return percentile rank (0-100) of value in population.

    Args:
        value: test value.
        population: array of reference values.

    Returns:
        Percentile (0-100).
    """
    if len(population) == 0:
        return 50.0
    rank = np.sum(population < value) / len(population)
    return rank * 100.0


def clip_to_confidence(value: float) -> float:
    """Clip value to [0, 1] confidence range."""
    return max(0.0, min(1.0, value))


def rolling_window(arr: np.ndarray, window_size: int) -> np.ndarray:
    """
    Create rolling window view of array.

    Useful for temporal smoothing or local statistics.

    Args:
        arr: 1D array.
        window_size: size of rolling window.

    Returns:
        2D array of shape (len(arr) - window_size + 1, window_size).
    """
    shape = (arr.shape[0] - window_size + 1, window_size)
    strides = (arr.strides[0], arr.strides[0])
    return np.lib.stride_tricks.as_strided(arr, shape=shape, strides=strides)
