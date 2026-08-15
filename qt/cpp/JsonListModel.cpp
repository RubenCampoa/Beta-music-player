#include "JsonListModel.h"

#include <QJsonDocument>

JsonListModel::JsonListModel(QObject *parent) : QAbstractListModel(parent) {}

int JsonListModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : m_items.size();
}

QVariantMap JsonListModel::get(int row) const
{
    if (row < 0 || row >= m_items.size()) return {};
    return m_items.at(row).toObject().toVariantMap();
}

QVariant JsonListModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() < 0 || index.row() >= m_items.size())
        return {};
    const QJsonObject item = m_items.at(index.row()).toObject();
    const auto value = [&item](const char *key) { return item.value(QLatin1String(key)).toVariant(); };
    switch (role) {
    case ItemRole: return item.toVariantMap();
    case IdRole: return value("id");
    case PlatformIdRole: return value("platformId");
    case NameRole: return value("name");
    case ArtistRole: return value("artist");
    case AlbumRole: return value("album");
    case CoverRole: return item.contains(QStringLiteral("cover")) ? value("cover") : value("coverUrl");
    case DurationRole: return value("duration");
    case SourceRole: return value("source");
    case VipRole: return item.contains(QStringLiteral("vip")) ? value("vip") : value("isVip");
    case LikedRole: return item.contains(QStringLiteral("isLiked")) ? value("isLiked") : value("liked");
    case DescriptionRole: return value("description");
    case CountRole: return item.contains(QStringLiteral("count")) ? value("count") : value("trackCount");
    case TimeRole: return value("time");
    case TranslationRole: return value("translation");
    case WordsRole: return value("words");
    default: return {};
    }
}

QHash<int, QByteArray> JsonListModel::roleNames() const
{
    return {
        {ItemRole, "item"}, {IdRole, "itemId"}, {PlatformIdRole, "platformId"},
        {NameRole, "name"}, {ArtistRole, "artist"}, {AlbumRole, "album"},
        {CoverRole, "cover"}, {DurationRole, "duration"}, {SourceRole, "source"},
        {VipRole, "vip"}, {LikedRole, "isLiked"}, {DescriptionRole, "description"},
        {CountRole, "trackCount"}, {TimeRole, "time"},
        {TranslationRole, "translation"}, {WordsRole, "words"}
    };
}

void JsonListModel::setItems(const QJsonArray &items)
{
    if (m_items == items) return;
    const int oldCount = m_items.size();
    beginResetModel();
    m_items = items;
    endResetModel();
    if (oldCount != m_items.size()) emit countChanged();
}
