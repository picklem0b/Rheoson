import { useUIStore } from "@/store/ui.store";
import { SettingsGroup, RadioGroup } from "../components/SettingsPrimitives";

export default function LayoutSection() {
   const {
      navStyle,
      navPosition,
      fontFamily,
      fontSize,
      setNavStyle,
      setNavPosition,
      setFontFamily,
      setFontSize
   } = useUIStore();

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='Navigation style'
            footer='Changes take effect immediately. Pill is the default floating style. Flat is a solid bar. Minimal shows icons only.'>
            <RadioGroup
               value={navStyle}
               onChange={setNavStyle}
               options={[
                  {
                     value: "pill",
                     label: "Pill",
                     sub: "Floating rounded bar — default Rheoson style"
                  },
                  {
                     value: "flat",
                     label: "Flat",
                     sub: "Solid bar with no rounding — edge-to-edge"
                  },
                  {
                     value: "minimal",
                     label: "Minimal",
                     sub: "Icons only, no labels — maximum space"
                  }
               ]}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Navigation position'
            footer='Bottom navigation is standard on mobile. Top bar mode moves the tabs to a top tab strip.'>
            <RadioGroup
               value={navPosition}
               onChange={setNavPosition}
               options={[
                  {
                     value: "bottom",
                     label: "Bottom",
                     sub: "Standard mobile bottom navigation"
                  },
                  {
                     value: "top",
                     label: "Top",
                     sub: "Tab bar along the top of the screen"
                  }
               ]}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Font'
            footer='Plus Jakarta Sans is the Rheoson default. Changes apply immediately across the entire app.'>
            <RadioGroup
               value={fontFamily}
               onChange={setFontFamily}
               options={[
                  {
                     value: "plus-jakarta",
                     label: "Plus Jakarta Sans",
                     sub: "Default — designed for readability"
                  },
                  {
                     value: "inter",
                     label: "Inter",
                     sub: "Clean and neutral — great on screens"
                  },
                  {
                     value: "system",
                     label: "System default",
                     sub: "Your device's native font"
                  }
               ]}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Text size'
            footer='Affects body text throughout the app. Headings scale proportionally.'>
            <RadioGroup
               value={fontSize}
               onChange={setFontSize}
               options={[
                  {
                     value: "small",
                     label: "Small",
                     sub: "Fits more content — 14 px base"
                  },
                  {
                     value: "default",
                     label: "Default",
                     sub: "Balanced readability — 16 px"
                  },
                  {
                     value: "large",
                     label: "Large",
                     sub: "Easier to read — 18 px base"
                  }
               ]}
            />
         </SettingsGroup>
      </div>
   );
}
