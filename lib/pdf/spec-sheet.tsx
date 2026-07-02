/**
 * Buyer-facing product spec sheet (one page, PDF). Uses @react-pdf/renderer with the
 * built-in Helvetica font (no font files to bundle on Netlify). Pure presentation —
 * no pricing/economics, just product info. Rendered server-side in /api/spec-sheet.
 */
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

export interface SpecSheetData {
  name: string;
  model: string | null;
  category: string | null;
  summary: string | null;
  specs: { label: string; value: string }[];
  features: string[];
  voltageFlag: boolean;
  imageDataUri: string | null; // pre-fetched data: URI (reliable on serverless)
  generatedAt: string;
}

const C = { ink: "#111827", muted: "#6B7280", line: "#E5E7EB", band: "#F3F4F6", target: "#4F46E5" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: C.ink, fontFamily: "Helvetica" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: C.muted, marginTop: 3 },
  hr: { borderBottomWidth: 1, borderBottomColor: C.line, marginVertical: 12 },
  row: { flexDirection: "row", gap: 18 },
  image: { width: 200, height: 200, objectFit: "contain", border: `1 solid ${C.line}`, borderRadius: 4 },
  imagePlaceholder: { width: 200, height: 200, border: `1 solid ${C.line}`, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  summaryCol: { flex: 1 },
  summary: { fontSize: 11, lineHeight: 1.5, color: "#374151" },
  voltage: { marginTop: 10, fontSize: 9, color: C.muted, border: `1 solid ${C.line}`, borderRadius: 4, padding: 6 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, color: C.ink },
  section: { marginTop: 16 },
  specRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6 },
  specRowAlt: { backgroundColor: C.band },
  specLabel: { width: 160, color: C.muted },
  specValue: { flex: 1 },
  feature: { marginBottom: 4, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
});

export function SpecSheet({ data }: { data: SpecSheetData }) {
  const meta = [data.category, data.model ? `Model ${data.model}` : null].filter(Boolean).join("   ·   ");
  return (
    <Document title={data.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{data.name}</Text>
        {meta ? <Text style={s.sub}>{meta}</Text> : null}
        <View style={s.hr} />

        <View style={s.row}>
          {data.imageDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image, not a DOM <img>; alt is not a valid prop
            <Image src={data.imageDataUri} style={s.image} />
          ) : (
            <View style={s.imagePlaceholder}>
              <Text style={{ color: C.muted, fontSize: 9 }}>Studio photo pending</Text>
            </View>
          )}
          <View style={s.summaryCol}>
            {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}
            {data.voltageFlag ? (
              <Text style={s.voltage}>220V input — needs a US-spec plug/voltage to resell in the US.</Text>
            ) : null}
          </View>
        </View>

        {data.specs.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h2}>Specifications</Text>
            {data.specs.map((sp, i) => (
              <View key={i} style={i % 2 === 1 ? [s.specRow, s.specRowAlt] : s.specRow}>
                <Text style={s.specLabel}>{sp.label}</Text>
                <Text style={s.specValue}>{sp.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.features.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h2}>Overview</Text>
            {data.features.map((f, i) => (
              <Text key={i} style={s.feature}>•  {f}</Text>
            ))}
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          Product spec sheet · generated {data.generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
