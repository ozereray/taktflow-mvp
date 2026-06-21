"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { analyzeProcessData, ProcessStep } from "../lib/analyzer";
import {
  AlertTriangle,
  TrendingDown,
  Clock,
  Activity,
  UploadCloud,
  CheckCircle2,
  Zap,
  Loader2,
  Download,
  ShieldCheck,
  Repeat,
} from "lucide-react";

export default function Dashboard() {
  const [rawData, setRawData] = useState<ProcessStep[] | null>(null);
  const [report, setReport] = useState<ReturnType<
    typeof analyzeProcessData
  > | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [costPerMinute, setCostPerMinute] = useState<number>(15);
  const [showRawData, setShowRawData] = useState(false);

  const lastAiBottleneckRef = useRef<string | null>(null);

  // CSV Parsing Logic
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setAiInsight(null);
    lastAiBottleneckRef.current = null;
    setShowRawData(false);

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Esnek kolon eşleştirme: farklı CSV formatlarını (alt çizgi, boşluk, Almanca isimler vs.) destekler
        const findValue = (row: any, possibleKeys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const key of possibleKeys) {
            const match = rowKeys.find(
              (k) =>
                k.toLowerCase().replace(/[_\s]/g, "") ===
                key.toLowerCase().replace(/[_\s]/g, ""),
            );
            if (
              match &&
              row[match] !== undefined &&
              row[match] !== null &&
              row[match] !== ""
            ) {
              return row[match];
            }
          }
          return undefined;
        };

        const formattedData: ProcessStep[] = results.data.map((row: any) => ({
          stationName:
            findValue(row, [
              "StationName",
              "Station_Name",
              "Station",
              "Name",
            ]) || "Unknown Station",
          taktTime: Number(
            findValue(row, [
              "TaktTime",
              "Takt_Time_min",
              "TaktTimeMin",
              "TaktTime_min",
              "SollZeit",
            ]) || 0,
          ),
          actualTime: Number(
            findValue(row, [
              "ActualTime",
              "Actual_Time_min",
              "ActualTimeMin",
              "ActualTime_min",
              "IstZeit",
            ]) || 0,
          ),
        }));

        // Sadece ham veriyi sakla; analiz aşağıdaki useEffect içinde
        // costPerMinute her değiştiğinde otomatik yeniden hesaplanır.
        setRawData(formattedData);
      },
    });
  };

  // costPerMinute veya rawData değiştiğinde raporu yeniden hesapla.
  // Bu sayede kullanıcı dosyayı yeniden yüklemeden maliyet kutusunu
  // değiştirebilir ve sonuçlar anında güncellenir.
  useEffect(() => {
    if (!rawData) return;
    const analysisResult = analyzeProcessData(rawData, costPerMinute);
    setReport(analysisResult);
  }, [rawData, costPerMinute]);

  // AI eylem planını sadece bottleneck istasyonu DEĞİŞTİĞİNDE çağır.
  // costPerMinute her tuş vuruşunda değişebileceği için, AI çağrısını
  // her seferinde tetiklemek hem yavaş hem de gereksiz API maliyeti yaratır.
  useEffect(() => {
    if (!report) return;
    const bottleneck = report.summary.criticalBottleneck;

    if (bottleneck === "None") {
      lastAiBottleneckRef.current = null;
      setAiInsight(null);
      return;
    }

    if (bottleneck === lastAiBottleneckRef.current) return;

    lastAiBottleneckRef.current = bottleneck;
    setIsAnalyzingAi(true);
    setAiInsight(null);

    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bottleneck,
        delay: report.summary.totalDelayMetrics,
        cost: report.summary.wasteCost,
      }),
    })
      .then((res) => res.json())
      .then((data) => setAiInsight(data.insight))
      .catch((error) => {
        console.error("AI Fetch error:", error);
        setAiInsight(
          "AI Engine connection failed. Please check API configuration.",
        );
      })
      .finally(() => setIsAnalyzingAi(false));
  }, [report]);

  // Kurumsal PDF Raporu Oluşturma Motoru
  const exportToPDF = () => {
    if (!report) return;

    const doc = new jsPDF();
    const currentDate = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Berlin",
    });

    // Başlık ve Logo Alanı
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(11, 15, 25);
    doc.text("TAKTFLOW", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text("Official Process Intelligence & Bottleneck Report", 14, 28);

    // Rapor Meta Verileri
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`File Analyzed: ${fileName}`, 14, 38);
    doc.text(`Date & Time (CET): ${currentDate}`, 14, 44);
    doc.text(`Cost Basis: EUR ${costPerMinute.toFixed(2)} / minute`, 14, 50);

    // Kırmızı Çizgi (Tasarım Detayı)
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(1);
    doc.line(14, 56, 196, 56);

    // Özet Metrikler
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("1. Executive Summary", 14, 68);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const bottleneckLabel = report.summary.bottleneckIsChronic
      ? `${report.summary.criticalBottleneck} (Chronic - avg +${report.summary.bottleneckAvgDelay} min across shifts)`
      : report.summary.criticalBottleneck;

    doc.text(`Critical Bottleneck: ${bottleneckLabel}`, 14, 78);
    doc.text(
      `Total Critical Deviation: ${report.summary.totalDelayMetrics} minutes`,
      14,
      84,
    );
    doc.text(
      `Estimated Waste Cost: EUR ${report.summary.wasteCost.toFixed(2)}`,
      14,
      90,
    );

    // AI Eylem Planı
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("2. TaktFlow AI Engineering Action Plan", 14, 104);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const splitAiText = doc.splitTextToSize(
      aiInsight || "No AI data available.",
      180,
    );
    doc.text(splitAiText, 14, 112);

    let finalY = 112 + splitAiText.length * 5 + 10;

    // İstasyon Özet Tablosu (vardiyalar arası ortalama)
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(
      "3. Station Performance Summary (Averaged Across Shifts)",
      14,
      finalY,
    );

    const aggTableData = report.stationAggregates.map((agg) => [
      agg.stationName,
      `${agg.taktTime} min`,
      `${agg.avgActualTime} min`,
      `${agg.avgDelay > 0 ? "+" : ""}${agg.avgDelay} min`,
      `${agg.criticalCount}/${agg.totalShifts}`,
      agg.isChronic
        ? "Chronic Issue"
        : agg.criticalCount > 0
          ? "Occasional Critical"
          : "Stable",
    ]);

    autoTable(doc, {
      startY: finalY + 6,
      head: [
        [
          "Station Name",
          "Takt Time",
          "Avg Actual",
          "Avg Deviation",
          "Critical Shifts",
          "Pattern",
        ],
      ],
      body: aggTableData,
      theme: "striped",
      headStyles: {
        fillColor: [11, 15, 25],
        textColor: 255,
        fontStyle: "bold",
      },
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index === 5) {
          if (data.cell.raw === "Chronic Issue") {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          } else if (data.cell.raw === "Occasional Critical") {
            data.cell.styles.textColor = [217, 119, 6];
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
    });

    finalY = (doc as any).lastAutoTable.finalY + 14;

    if (finalY > 250) {
      doc.addPage();
      finalY = 20;
    }

    // Ham Veri (Appendix) Tablosu
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("4. Appendix: Raw Shift-by-Shift Data", 14, finalY);

    const tableData = report.steps.map((step) => [
      step.stationName,
      `${step.taktTime} min`,
      `${step.actualTime} min`,
      `${step.delay > 0 ? "+" : ""}${step.delay} min`,
      step.status,
    ]);

    autoTable(doc, {
      startY: finalY + 6,
      head: [
        ["Station Name", "Takt Time", "Actual Time", "Deviation", "Status"],
      ],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [11, 15, 25],
        textColor: 255,
        fontStyle: "bold",
      },
      didParseCell: function (data) {
        if (data.section === "body") {
          const rowData = data.row.raw as any[];
          const status = rowData[4];
          const delayValue = rowData[3];
          const isPositiveDelay =
            typeof delayValue === "string" && delayValue.trim().startsWith("+");

          // Sapma sütunu: pozitifse (gecikme) kırmızı, negatif/sıfırsa (erken/zamanında) yeşil
          if (data.column.index === 3) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = isPositiveDelay
              ? [220, 38, 38]
              : [16, 185, 129];
          }

          // Status sütunu
          if (data.column.index === 4) {
            data.cell.styles.fontStyle = "bold";
            if (status === "Critical") {
              data.cell.styles.textColor = [220, 38, 38];
            } else if (status === "Minor Deviation") {
              data.cell.styles.textColor = [217, 119, 6];
            } else {
              data.cell.styles.textColor = [16, 185, 129];
            }
          }
        }
      },
    });

    // Alt Bilgi (Footer) ve GDPR Bildirimi
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        "CONFIDENTIAL. Generated securely by TaktFlow AI. In compliance with GDPR, no raw operational data is stored on our servers.",
        14,
        doc.internal.pageSize.height - 10,
      );
    }

    doc.save(`TaktFlow_Executive_Report_${fileName?.replace(".csv", "")}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white p-8 font-sans bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] flex flex-col">
      {/* Navbar */}
      <div className="max-w-6xl mx-auto w-full mb-6 flex justify-between items-center bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl flex items-center justify-center shadow-lg">
            <Image
              src="/taktFlow.png"
              alt="TaktFlow Logo"
              width={140}
              height={40}
              className="object-contain"
            />
          </div>
          <span className="text-slate-400 text-sm hidden md:block border-l border-slate-700 pl-3 ml-2">
            AI-Powered Process Intelligence
          </span>
        </div>

        <label className="cursor-pointer bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 px-6 py-3 rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(29,78,216,0.4)] flex items-center gap-2">
          <UploadCloud size={20} />
          {fileName ? "Upload New Data" : "Upload CSV Data"}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Kostensatz Eingabe */}
      <div className="max-w-6xl mx-auto w-full mb-12 flex items-center gap-3 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
        <label className="text-slate-300 text-sm font-medium">
          Kostensatz pro Minute (€):
        </label>
        <input
          type="number"
          min={1}
          value={costPerMinute}
          onChange={(e) => setCostPerMinute(Number(e.target.value) || 15)}
          className="bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-white w-24 text-sm"
        />
        <span className="text-slate-500 text-xs">
          (Standard: €15 — passen Sie dies an Ihre tatsächlichen Betriebskosten
          an)
        </span>
      </div>

      <div className="flex-grow">
        {!report && (
          <div className="max-w-xl mx-auto mt-24 text-center space-y-6">
            <div className="w-24 h-24 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
              <Activity className="text-blue-500" size={40} />
            </div>
            <h2 className="text-3xl font-bold">
              Measure the Rhythm of Your Line
            </h2>
            <p className="text-slate-400">
              Upload your operational CSV. Our AI will instantly detect
              bottlenecks and prescribe engineering solutions.
            </p>
          </div>
        )}

        {report && (
          <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500" />
                Analysis Complete
              </h2>
              {/* PDF İNDİRME BUTONU */}
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-colors shadow-lg"
              >
                <Download size={18} />
                Export Official PDF
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#1A1F2C]/80 backdrop-blur-xl border border-red-500/20 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl"></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-red-500/20 rounded-xl text-red-500">
                    <AlertTriangle size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-slate-300">
                    Critical Bottleneck
                  </h3>
                </div>
                <p className="text-3xl font-bold text-white">
                  {report.summary.criticalBottleneck}
                </p>
                {report.summary.criticalBottleneck !== "None" && (
                  <p className="text-xs text-slate-400 mt-2">
                    {report.summary.bottleneckIsChronic
                      ? `Chronic — avg +${report.summary.bottleneckAvgDelay} min across shifts`
                      : `Avg +${report.summary.bottleneckAvgDelay} min`}
                  </p>
                )}
              </div>

              <div className="bg-[#1A1F2C]/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl"></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-orange-500/20 rounded-xl text-orange-400">
                    <Clock size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-slate-300">
                    Total Deviation
                  </h3>
                </div>
                <p className="text-3xl font-bold text-white">
                  {report.summary.totalDelayMetrics}{" "}
                  <span className="text-lg font-normal text-slate-400">
                    mins
                  </span>
                </p>
              </div>

              <div className="bg-[#1A1F2C]/80 backdrop-blur-xl border border-blue-600/30 p-6 rounded-3xl relative overflow-hidden group shadow-[0_0_30px_rgba(29,78,216,0.1)]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl"></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-blue-600/20 rounded-xl text-blue-400">
                    <TrendingDown size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-slate-300">
                    Estimated Waste Cost
                  </h3>
                </div>
                <p className="text-3xl font-bold text-white">
                  €{report.summary.wasteCost.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-900/40 to-blue-900/20 backdrop-blur-xl border border-indigo-500/30 p-8 rounded-3xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-indigo-300">
                <Zap className="text-indigo-400" /> TaktFlow AI Action Plan
              </h3>

              {isAnalyzingAi ? (
                <div className="flex items-center gap-3 text-slate-400 py-4">
                  <Loader2 className="animate-spin text-indigo-500" /> AI is
                  formulating engineering solutions...
                </div>
              ) : aiInsight ? (
                <div className="text-slate-200 leading-relaxed space-y-2 whitespace-pre-wrap font-medium">
                  {aiInsight}
                </div>
              ) : null}
            </div>

            {/* İSTASYON ÖZETİ (vardiyalar arası ortalama) */}
            <div className="bg-[#1A1F2C]/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl mt-4 overflow-x-auto">
              <h3 className="text-xl font-medium mb-6 flex items-center gap-2">
                <Activity className="text-blue-500" /> Station Performance
                Summary
              </h3>
              <div className="space-y-3 min-w-[800px]">
                {report.stationAggregates.map((agg, index) => {
                  const pattern = agg.isChronic
                    ? "Chronic Issue"
                    : agg.criticalCount > 0
                      ? "Occasional Critical"
                      : "Stable";

                  const colorClasses =
                    pattern === "Chronic Issue"
                      ? "bg-red-500/10 text-red-500 border border-red-500/20"
                      : pattern === "Occasional Critical"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";

                  return (
                    <div
                      key={index}
                      className="flex justify-between items-center p-4 bg-black/20 rounded-2xl border border-white/5"
                    >
                      <span className="font-semibold text-lg text-slate-200 w-1/4">
                        {agg.stationName}
                      </span>
                      <div className="flex items-center justify-between w-3/4">
                        <div className="flex flex-col w-1/4">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                            Takt Time
                          </span>
                          <span className="text-slate-300 font-medium">
                            {agg.taktTime} min
                          </span>
                        </div>
                        <div className="flex flex-col w-1/4 border-l border-white/10 pl-4">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                            Avg Actual
                          </span>
                          <span className="text-slate-300 font-medium">
                            {agg.avgActualTime} min
                          </span>
                        </div>
                        <div className="w-1/4 text-right">
                          <span
                            className={`px-4 py-2 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-44 ${colorClasses}`}
                          >
                            {pattern === "Chronic Issue" ? (
                              <Repeat size={16} />
                            ) : pattern === "Occasional Critical" ? (
                              <Clock size={16} />
                            ) : (
                              <CheckCircle2 size={16} />
                            )}
                            {pattern}
                          </span>
                        </div>
                        <div className="w-1/4 text-right font-mono text-sm">
                          {agg.avgDelay > 0 ? (
                            <span
                              className={
                                pattern === "Chronic Issue"
                                  ? "text-red-400"
                                  : "text-amber-400"
                              }
                            >
                              +{agg.avgDelay} min avg
                            </span>
                          ) : (
                            <span className="text-slate-500">On time avg</span>
                          )}
                          <div className="text-slate-500 text-[10px] mt-1">
                            Critical in {agg.criticalCount}/{agg.totalShifts}{" "}
                            shifts
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowRawData((prev) => !prev)}
                className="text-slate-400 text-sm hover:text-slate-200 transition-colors underline"
              >
                {showRawData
                  ? "Hide raw shift-by-shift data"
                  : "Show raw shift-by-shift data"}
              </button>
            </div>

            {/* HAM VERİ (her vardiya tek tek) — varsayılan olarak gizli */}
            {showRawData && (
              <div className="bg-[#1A1F2C]/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl mt-4 overflow-x-auto">
                <h3 className="text-xl font-medium mb-6 flex items-center gap-2">
                  <Activity className="text-slate-500" /> Raw Shift-by-Shift
                  Data
                </h3>
                <div className="space-y-3 min-w-[800px]">
                  {report.steps.map((step, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-4 bg-black/20 rounded-2xl border border-white/5"
                    >
                      <span className="font-semibold text-lg text-slate-200 w-1/4">
                        {step.stationName}
                      </span>
                      <div className="flex items-center justify-between w-3/4">
                        <div className="flex flex-col w-1/4">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                            Takt Time
                          </span>
                          <span className="text-slate-300 font-medium">
                            {step.taktTime} min
                          </span>
                        </div>
                        <div className="flex flex-col w-1/4 border-l border-white/10 pl-4">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                            Actual
                          </span>
                          <span className="text-slate-300 font-medium">
                            {step.actualTime} min
                          </span>
                        </div>
                        <div className="w-1/4 text-right">
                          <span
                            className={`px-4 py-2 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-32 ${
                              step.status === "Critical"
                                ? "bg-red-500/10 text-red-500 border border-red-500/20"
                                : step.status === "Minor Deviation"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {step.status === "Critical" ? (
                              <AlertTriangle size={16} />
                            ) : step.status === "Minor Deviation" ? (
                              <Clock size={16} />
                            ) : (
                              <CheckCircle2 size={16} />
                            )}
                            {step.status}
                          </span>
                        </div>
                        <div className="w-1/4 text-right font-mono text-sm">
                          {step.delay > 0 ? (
                            <span
                              className={
                                step.status === "Critical"
                                  ? "text-red-400"
                                  : "text-amber-400"
                              }
                            >
                              +{step.delay} min delay
                            </span>
                          ) : (
                            <span className="text-slate-500">On time</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GDPR Güvenlik Etiketi */}
      <div className="max-w-6xl mx-auto w-full mt-12 pt-6 border-t border-white/10 flex justify-center items-center gap-2 text-slate-500 text-xs">
        <ShieldCheck size={16} className="text-emerald-500/70" />
        <span>
          Enterprise-Grade Security. Fully GDPR Compliant. No raw data is
          retained after session ends.
        </span>
      </div>
    </div>
  );
}
