package com.momentum.training

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.Period

@CapacitorPlugin(name = "MomentumAndroid")
class MomentumAndroidPlugin : Plugin() {
    private val recordTypes = mapOf(
        "weight_kg" to WeightRecord::class,
        "body_fat_pct" to BodyFatRecord::class,
        "lean_mass_kg" to LeanBodyMassRecord::class,
        "sleep" to SleepSessionRecord::class,
    )
    private val dailyMetrics = mapOf(
        "steps" to StepsRecord.COUNT_TOTAL,
        "heart_rate" to HeartRateRecord.BPM_AVG,
    )
    private val permissions = recordTypes.mapValues { HealthPermission.getReadPermission(it.value) } + mapOf(
        "steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "heart_rate" to HealthPermission.getReadPermission(HeartRateRecord::class),
    )
    private val host get() = activity as MainActivity

    @PluginMethod
    fun status(call: PluginCall) = runCall(call) {
        val status = HealthConnectClient.getSdkStatus(context)
        val granted = if (status == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
        } else emptySet()
        JSObject()
            .put("available", status == HealthConnectClient.SDK_AVAILABLE)
            .put("granted", JSArray(permissions.filterValues { it in granted }.keys.toList()))
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        activity.runOnUiThread {
            host.requestHealthPermissions(call, permissions.values.toSet())
        }
    }

    @PluginMethod
    fun beginImport(call: PluginCall) = runCall(call) {
        val type = requireNotNull(recordTypes[call.getString("type")])
        val token = HealthConnectClient.getOrCreate(context).getChangesToken(ChangesTokenRequest(setOf(type)))
        JSObject().put("token", token)
    }

    @PluginMethod
    fun readDailyHealth(call: PluginCall) = runCall(call) {
        val metric = requireNotNull(dailyMetrics[call.getString("type")])
        val lastDay = LocalDate.now()
        val firstDay = lastDay.minusDays(28)
        val buckets = HealthConnectClient.getOrCreate(context).aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(metric),
                timeRangeFilter = TimeRangeFilter.between(firstDay.atStartOfDay(), lastDay.plusDays(1).atStartOfDay()),
                timeRangeSlicer = Period.ofDays(1),
            )
        )
        val readings = buckets.mapNotNull { bucket ->
            bucket.result[metric]?.let { value ->
                JSObject().put("day", bucket.startTime.toLocalDate().toString()).put("value", value)
            }
        }
        JSObject().put("firstDay", firstDay.toString()).put("lastDay", lastDay.toString())
            .put("readings", JSArray(readings))
    }

    @PluginMethod
    fun readPage(call: PluginCall) = runCall(call) {
        val type = requireNotNull(recordTypes[call.getString("type")])
        val page = HealthConnectClient.getOrCreate(context).readRecords(
            ReadRecordsRequest(
                recordType = type,
                timeRangeFilter = TimeRangeFilter.between(
                    Instant.parse(requireNotNull(call.getString("start"))),
                    Instant.parse(requireNotNull(call.getString("end"))),
                ),
                pageSize = 250,
                pageToken = call.getString("pageToken"),
            )
        )
        JSObject()
            .put("records", JSArray(page.records.map(::serialize)))
            .put("nextPage", page.pageToken ?: JSONObject.NULL)
    }

    @PluginMethod
    fun readChanges(call: PluginCall) = runCall(call) {
        val page = HealthConnectClient.getOrCreate(context).getChanges(requireNotNull(call.getString("token")))
        // Collapse repeated edits to the same record within this page in change order.
        val updates = linkedMapOf<String, Record?>()
        for (change in page.changes) {
            when (change) {
                is UpsertionChange -> updates[change.record.metadata.id] = change.record
                is DeletionChange -> updates[change.recordId] = null
            }
        }
        JSObject()
            .put("records", JSArray(updates.values.filterNotNull().map(::serialize)))
            .put("deleted", JSArray(updates.filterValues { it == null }.keys.toList()))
            .put("token", page.nextChangesToken)
            .put("more", page.hasMore)
            .put("expired", page.changesTokenExpired)
    }

    @PluginMethod
    fun saveCsv(call: PluginCall) {
        val filename = call.getString("filename")
        val text = call.getString("text")
        if (filename == null || text == null) {
            call.reject("Filename and CSV content are required")
            return
        }
        activity.runOnUiThread { host.saveExport(call, filename, text, call.getString("mime")) }
    }

    private fun runCall(call: PluginCall, operation: suspend () -> JSObject) {
        host.lifecycleScope.launch {
            try {
                call.resolve(operation())
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                call.reject("Health Connect operation failed", error)
            }
        }
    }

    private fun serialize(record: Record): JSObject {
        val json = JSObject()
            .put("record_id", record.metadata.id)
            .put("source_package", record.metadata.dataOrigin.packageName)

        return when (record) {
            is WeightRecord -> measurement(json, record.time, record.zoneOffset?.totalSeconds, record.weight.inKilograms)
            is BodyFatRecord -> measurement(json, record.time, record.zoneOffset?.totalSeconds, record.percentage.value)
            is LeanBodyMassRecord -> measurement(json, record.time, record.zoneOffset?.totalSeconds, record.mass.inKilograms)
            is SleepSessionRecord -> json
                .put("started_at", record.startTime.toString())
                .put("ended_at", record.endTime.toString())
                .put("start_offset_seconds", record.startZoneOffset?.totalSeconds ?: JSONObject.NULL)
                .put("end_offset_seconds", record.endZoneOffset?.totalSeconds ?: JSONObject.NULL)
                .put("stages", JSArray(record.stages.map { stage ->
                    JSObject()
                        .put("start", stage.startTime.toString())
                        .put("end", stage.endTime.toString())
                        .put("type", stage.stage)
                }))
            else -> error("Unsupported Health Connect record")
        }
    }

    private fun measurement(json: JSObject, time: Instant, offset: Int?, value: Double): JSObject =
        json.put("measured_at", time.toString())
            .put("zone_offset_seconds", offset ?: JSONObject.NULL)
            .put("value", value)
}
