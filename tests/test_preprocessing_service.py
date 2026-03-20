from __future__ import annotations

from dataclasses import replace

import pytest

from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult
from groundshift.core.preprocessing.service import PreprocessingService


@pytest.fixture
def preprocessing_request(tmp_path) -> PreprocessingRequest:
    return PreprocessingRequest(
        reference_scene_path=str(tmp_path / "reference.tif"),
        target_scene_path=str(tmp_path / "target.tif"),
        output_dir=str(tmp_path / "out"),
        cloud_cover_threshold=0.4,
    )


def test_preprocessing_service_calls_steps_in_order(
    preprocessing_request: PreprocessingRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = PreprocessingService()
    calls: list[str] = []

    coreg_result = PreprocessingResult(
        reference_aligned_path="reference_aligned.tif",
        target_aligned_path="target_aligned.tif",
    )

    def fake_coregister_scenes(request: PreprocessingRequest) -> PreprocessingResult:
        assert request is preprocessing_request
        calls.append("coregister")
        return coreg_result

    def fake_apply_cloud_mask(
        result: PreprocessingResult,
        request: PreprocessingRequest,
    ) -> PreprocessingResult:
        assert request is preprocessing_request
        assert result is coreg_result
        calls.append("cloud_mask")
        return replace(
            result,
            reference_masked_path="reference_masked.tif",
            target_masked_path="target_masked.tif",
            reference_cloud_mask_path="reference_cloud_mask.tif",
            target_cloud_mask_path="target_cloud_mask.tif",
        )

    def fake_apply_normalisation(
        result: PreprocessingResult,
        request: PreprocessingRequest,
    ) -> PreprocessingResult:
        assert request is preprocessing_request
        assert result.reference_masked_path == "reference_masked.tif"
        assert result.target_masked_path == "target_masked.tif"
        calls.append("normalisation")
        return replace(
            result,
            reference_normalized_path="reference_normalized.tif",
            target_normalized_path="target_normalized.tif",
        )

    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.coregister_scenes",
        fake_coregister_scenes,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_cloud_mask",
        fake_apply_cloud_mask,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_normalisation",
        fake_apply_normalisation,
    )

    service.run(preprocessing_request)

    assert calls == ["coregister", "cloud_mask", "normalisation"]


def test_preprocessing_service_populates_all_six_output_paths(
    preprocessing_request: PreprocessingRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = PreprocessingService()

    def fake_coregister_scenes(_request: PreprocessingRequest) -> PreprocessingResult:
        return PreprocessingResult(
            reference_aligned_path="reference_aligned.tif",
            target_aligned_path="target_aligned.tif",
        )

    def fake_apply_cloud_mask(
        result: PreprocessingResult,
        _request: PreprocessingRequest,
    ) -> PreprocessingResult:
        return replace(
            result,
            reference_masked_path="reference_masked.tif",
            target_masked_path="target_masked.tif",
            reference_cloud_mask_path="reference_cloud_mask.tif",
            target_cloud_mask_path="target_cloud_mask.tif",
        )

    def fake_apply_normalisation(
        result: PreprocessingResult,
        _request: PreprocessingRequest,
    ) -> PreprocessingResult:
        return replace(
            result,
            reference_normalized_path="reference_normalized.tif",
            target_normalized_path="target_normalized.tif",
        )

    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.coregister_scenes",
        fake_coregister_scenes,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_cloud_mask",
        fake_apply_cloud_mask,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_normalisation",
        fake_apply_normalisation,
    )

    result = service.run(preprocessing_request)

    assert result.reference_aligned_path is not None
    assert result.target_aligned_path is not None
    assert result.reference_masked_path is not None
    assert result.target_masked_path is not None
    assert result.reference_normalized_path is not None
    assert result.target_normalized_path is not None


def test_preprocessing_service_raises_if_cloud_mask_paths_missing(
    preprocessing_request: PreprocessingRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = PreprocessingService()

    def fake_coregister_scenes(_request: PreprocessingRequest) -> PreprocessingResult:
        return PreprocessingResult(
            reference_aligned_path="reference_aligned.tif",
            target_aligned_path="target_aligned.tif",
        )

    def fake_apply_cloud_mask(
        result: PreprocessingResult,
        _request: PreprocessingRequest,
    ) -> PreprocessingResult:
        return replace(
            result,
            reference_masked_path=None,
            target_masked_path=None,
        )

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("apply_normalisation must not be called")

    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.coregister_scenes",
        fake_coregister_scenes,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_cloud_mask",
        fake_apply_cloud_mask,
    )
    monkeypatch.setattr(
        "groundshift.core.preprocessing.service.apply_normalisation",
        fail_if_called,
    )

    with pytest.raises(ValueError, match="masked paths"):
        service.run(preprocessing_request)
