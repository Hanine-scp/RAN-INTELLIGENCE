from __future__ import annotations

import os


def init_otel(app) -> bool:
    """Enable OpenTelemetry tracing when OTEL_EXPORTER_OTLP_ENDPOINT is configured."""
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        service_name = os.getenv("OTEL_SERVICE_NAME", "ran-intelligence-api")
        resource = Resource.create(
            {
                "service.name": service_name,
                "service.version": os.getenv("OTEL_SERVICE_VERSION", "2.0.0"),
                "deployment.environment": os.getenv("OTEL_DEPLOYMENT_ENV", "development"),
            }
        )
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/ready,/metrics")
        return True
    except Exception:
        return False
