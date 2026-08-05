#include <jni.h>
#include <cstdlib>
#include <cstring>

#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_com_beta_musicplayer_runtime_EmbeddedNodeRuntime_startNodeWithArguments(
        JNIEnv* env,
        jclass /* clazz */,
        jobjectArray arguments) {
    const jsize argumentCount = env->GetArrayLength(arguments);
    if (argumentCount <= 0) return -1;

    size_t bufferSize = 0;
    for (jsize i = 0; i < argumentCount; ++i) {
        auto argument = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char* value = env->GetStringUTFChars(argument, nullptr);
        bufferSize += std::strlen(value) + 1;
        env->ReleaseStringUTFChars(argument, value);
        env->DeleteLocalRef(argument);
    }

    char* buffer = static_cast<char*>(std::calloc(bufferSize, sizeof(char)));
    if (buffer == nullptr) return -2;

    char** argv = static_cast<char**>(std::calloc(argumentCount, sizeof(char*)));
    if (argv == nullptr) {
        std::free(buffer);
        return -3;
    }

    char* cursor = buffer;
    for (jsize i = 0; i < argumentCount; ++i) {
        auto argument = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char* value = env->GetStringUTFChars(argument, nullptr);
        const size_t length = std::strlen(value);
        std::memcpy(cursor, value, length);
        argv[i] = cursor;
        cursor += length + 1;
        env->ReleaseStringUTFChars(argument, value);
        env->DeleteLocalRef(argument);
    }

    const int result = node::Start(argumentCount, argv);
    std::free(argv);
    std::free(buffer);
    return result;
}
