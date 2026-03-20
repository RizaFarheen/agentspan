{{- define "agentspan.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentspan.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentspan.labels" -}}
helm.sh/chart: {{ include "agentspan.chart" . }}
app.kubernetes.io/name: {{ include "agentspan.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "agentspan.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentspan.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "agentspan.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "agentspan.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "agentspan.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.postgresFullname" -}}
{{- printf "%s-postgres" (include "agentspan.fullname" .) -}}
{{- end -}}

{{- define "agentspan.dbHost" -}}
{{- if .Values.postgres.enabled -}}
{{- include "agentspan.postgresFullname" . -}}
{{- else -}}
{{- .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.dbPort" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.service.port | toString -}}
{{- else -}}
{{- .Values.externalDatabase.port | toString -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.dbName" -}}
{{- if .Values.postgres.enabled -}}
{{- .Values.postgres.database -}}
{{- else -}}
{{- .Values.externalDatabase.database -}}
{{- end -}}
{{- end -}}

{{- define "agentspan.validateValues" -}}
{{- if and .Values.postgres.enabled .Values.externalDatabase.enabled -}}
{{- fail "Only one of postgres.enabled or externalDatabase.enabled may be true." -}}
{{- end -}}
{{- if and (not .Values.postgres.enabled) (not .Values.externalDatabase.enabled) -}}
{{- fail "One of postgres.enabled or externalDatabase.enabled must be true." -}}
{{- end -}}
{{- if and .Values.externalDatabase.enabled (empty .Values.externalDatabase.host) -}}
{{- fail "externalDatabase.host is required when externalDatabase.enabled=true." -}}
{{- end -}}
{{- if and .Values.secrets.existingSecret .Values.secrets.create -}}
{{- fail "Set either secrets.existingSecret or secrets.create=true, not both." -}}
{{- end -}}
{{- if and (not .Values.secrets.create) (empty .Values.secrets.existingSecret) -}}
{{- fail "When secrets.create=false, secrets.existingSecret must be set." -}}
{{- end -}}
{{- end -}}
