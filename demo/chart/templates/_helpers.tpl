{{/* Common labels applied to every demo object. */}}
{{- define "demo.labels" -}}
app.kubernetes.io/part-of: kcd-kl-2026
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
Injection annotation for MESHED workloads — follows .Values.mesh.enabled so the
whole demo can be flipped unmeshed. Usage:
  annotations:
    {{- include "demo.meshAnnotation" . | nindent 8 }}
*/}}
{{- define "demo.meshAnnotation" -}}
linkerd.io/inject: {{ if .Values.mesh.enabled }}enabled{{ else }}disabled{{ end }}
{{- end -}}
