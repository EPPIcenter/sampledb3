import CollectionDestinationPicker, {
  type DestinationCollection,
} from './CollectionDestinationPicker'
import type { Location } from '../lib/api/types'
import type { PlateCandidate } from '../lib/plate-filename-match'

export type CryovialBox = DestinationCollection

interface CryovialBoxPickerProps {
  locations: Location[]
  boxes: CryovialBox[]
  value?: string
  onChange: (boxName: string) => void
  disabled?: boolean
  loading?: boolean
  suggestedBoxes?: PlateCandidate[]
  allowCreateNew?: boolean
  suggestedNewBoxName?: string | null
}

export default function CryovialBoxPicker({
  boxes,
  suggestedBoxes,
  suggestedNewBoxName,
  ...rest
}: CryovialBoxPickerProps) {
  return (
    <CollectionDestinationPicker
      kind="box"
      collections={boxes}
      suggestedCollections={suggestedBoxes}
      suggestedNewName={suggestedNewBoxName}
      {...rest}
    />
  )
}
