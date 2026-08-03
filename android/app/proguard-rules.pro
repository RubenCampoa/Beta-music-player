# Add project specific ProGuard rules here.
# Keep kotlinx.serialization generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.beta.musicplayer.**$$serializer { *; }
-keepclassmembers class com.beta.musicplayer.** {
    *** Companion;
}
-keepclasseswithmembers class com.beta.musicplayer.** {
    kotlinx.serialization.KSerializer serializer(...);
}
