import { describe, it, expect } from 'vitest'
import { parseBioradCsv } from '../qpcr-result-parse'

describe('qpcr-result-parse', () => {
  describe('parseBioradCsv', () => {
    it('returns runMetadata and wellResults with empty arrays when no data', () => {
      const result = parseBioradCsv('', 'test.csv')
      expect(result).toHaveProperty('runMetadata')
      expect(result).toHaveProperty('wellResults')
      expect(result).toHaveProperty('amplificationData')
      expect(result.wellResults).toEqual([])
      expect(result.amplificationData).toEqual([])
      expect(result.runMetadata.fileName).toBe('test.csv')
    })

    it('parses metadata rows Run Started, Run Ended, File Name', () => {
      const csv = [
        'Run Started,2024-01-15 10:00:00',
        'Run Ended,2024-01-15 11:00:00',
        'File Name,MyExperiment',
        '',
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Std-1,10k,12.5,10000',
        'A2,Neg Ctrl-6,Neg ctrl,,',
      ].join('\n')
      const result = parseBioradCsv(csv, 'uploaded.csv')
      expect(result.runMetadata.runStartedAt).toBe('2024-01-15 10:00:00')
      expect(result.runMetadata.runEndedAt).toBe('2024-01-15 11:00:00')
      expect(result.runMetadata.experimentName).toBe('MyExperiment')
      expect(result.runMetadata.fileName).toBe('uploaded.csv')
    })

    it('maps Content to task and standardQuantity (NTC, STD-1..5, Unkn)', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Std-1,10k,12.5,10000',
        'A2,Std-2,1k,15.1,1000',
        'A3,Std-3,100,18.2,100',
        'A4,Std-4,10,21.0,10',
        'A5,Std-5,1,24.5,1',
        'A6,Neg Ctrl-6,Neg ctrl,,',
        'A7,Unkn,Sample1,20.0,5.5',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      expect(result.wellResults.length).toBeGreaterThanOrEqual(7)

      const byWell = Object.fromEntries(result.wellResults.map((r) => [r.wellPosition, r]))
      expect(byWell['A01']?.task).toBe('STANDARD')
      expect(byWell['A01']?.standardQuantity).toBe(10000)
      expect(byWell['A02']?.task).toBe('STANDARD')
      expect(byWell['A02']?.standardQuantity).toBe(1000)
      expect(byWell['A06']?.task).toBe('NTC')
      expect(byWell['A06']?.standardQuantity).toBeNull()
      expect(byWell['A07']?.task).toBe('UNKNOWN')
      expect(byWell['A07']?.standardQuantity).toBeNull()
    })

    it('normalizes well position to A01 style', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'a1,Std-1,,,',
        'H12,Neg ctrl,,,',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      const positions = result.wellResults.map((r) => r.wellPosition)
      expect(positions).toContain('A01')
      expect(positions).toContain('H12')
    })

    it('includes wellResult fields: wellPosition, targetName, sampleBarcode, task, cq, quantity, standardQuantity, ampStatus', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Unkn,BARCODE-001,20.5,3.2',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      expect(result.wellResults.length).toBe(1)
      const row = result.wellResults[0]
      expect(row).toHaveProperty('wellPosition')
      expect(row).toHaveProperty('targetName')
      expect(row).toHaveProperty('sampleBarcode')
      expect(row).toHaveProperty('task')
      expect(row).toHaveProperty('cq')
      expect(row).toHaveProperty('quantity')
      expect(row).toHaveProperty('standardQuantity')
      expect(row).toHaveProperty('ampStatus')
      expect(row.sampleBarcode).toBe('BARCODE-001')
      expect(row.cq).toBe(20.5)
      expect(row.quantity).toBe(3.2)
    })
  })
})
